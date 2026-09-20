import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_COOKIE_NAME, verifyAdminTokenState } from '@/lib/adminJwt';
import { CUSTOMER_COOKIE_NAME, verifyCustomerTokenState } from '@/lib/customerJwt';
import { logServerError } from '@/lib/apiError';
import {
  deleteMedia,
  getMediaStorageConfiguration,
  MediaStorageOperationError,
  MediaStorageUnavailableError,
  uploadMedia,
  type MediaStorageScope,
} from '@/lib/mediaStorage';
import {
  MAX_ADMIN_VIDEO_BYTES,
  MAX_REVIEW_IMAGE_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  validateMediaFile,
} from '@/lib/mediaValidation';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { AuditEvent } from '@/models/AuditEvent';
import { MediaAsset } from '@/models/MediaAsset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const deleteSchema = z.object({ assetId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

type UploadActor = {
  type: 'customer' | 'admin';
  id: string;
  permissions: string[];
};

function response(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function canManageMedia(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('media:manage');
}

async function authorizeForScope(request: NextRequest, scope: MediaStorageScope): Promise<
  | { ok: true; actor: UploadActor }
  | { ok: false; status: number; error: string }
> {
  if (scope === 'review') {
    const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
    if (!token) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
    const state = await verifyCustomerTokenState(token);
    if (state.status === 'database_unavailable') return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
    if (state.status !== 'valid') return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
    return { ok: true, actor: { type: 'customer', id: state.accountId, permissions: [] } };
  }

  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
  const state = await verifyAdminTokenState(token);
  if (state.status === 'database_unavailable') return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  if (state.status !== 'valid') return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
  if (!canManageMedia(state.permissions)) return { ok: false, status: 403, error: 'FORBIDDEN' };
  return { ok: true, actor: { type: 'admin', id: state.accountId, permissions: state.permissions } };
}

async function authorizeForDeletion(request: NextRequest): Promise<
  | { ok: true; actor: UploadActor }
  | { ok: false; status: number; error: string }
> {
  const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (adminToken) {
    const state = await verifyAdminTokenState(adminToken);
    if (state.status === 'database_unavailable') return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
    if (state.status === 'valid') {
      if (!canManageMedia(state.permissions)) return { ok: false, status: 403, error: 'FORBIDDEN' };
      return { ok: true, actor: { type: 'admin', id: state.accountId, permissions: state.permissions } };
    }
  }
  const customerToken = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!customerToken) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
  const state = await verifyCustomerTokenState(customerToken);
  if (state.status === 'database_unavailable') return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  if (state.status !== 'valid') return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
  return { ok: true, actor: { type: 'customer', id: state.accountId, permissions: [] } };
}

async function recordAudit(input: {
  actor: UploadActor;
  action: string;
  assetId?: string;
  outcome: 'success' | 'failure';
  request: NextRequest;
  metadata: Record<string, unknown>;
}) {
  await AuditEvent.create({
    actorType: input.actor.type,
    actorId: input.actor.id,
    action: input.action,
    resourceType: 'media_asset',
    resourceId: input.assetId ?? null,
    correlationId: input.request.headers.get('x-request-id'),
    outcome: input.outcome,
    metadata: input.metadata,
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const scopeValue = request.nextUrl.searchParams.get('scope');
  if (scopeValue !== 'review' && scopeValue !== 'admin-gallery') {
    return response({ ok: false, error: 'INVALID_UPLOAD_SCOPE' }, 400);
  }
  const scope: MediaStorageScope = scopeValue;
  const authorization = await authorizeForScope(request, scope);
  if (!authorization.ok) return response({ ok: false, error: authorization.error }, authorization.status);
  const { actor } = authorization;

  if (getMediaStorageConfiguration().provider === 'disabled') {
    return response({
      ok: false,
      error: 'UPLOAD_STORAGE_NOT_CONFIGURED',
      message: 'Durable media uploads are unavailable until object storage is configured.',
    }, 503);
  }

  try {
    const limited = await distributedRateLimit(
      `media-upload:${scope}:${actor.type}:${actor.id}:${getClientIp(request)}`,
      scope === 'review' ? 5 : 20,
      60,
    );
    if (!limited.allowed) {
      return response(
        { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
        429,
        { 'Retry-After': String(limited.retryAfter ?? 60) },
      );
    }
  } catch (error) {
    logServerError({ route: 'POST /api/upload rate-limit', err: error, requestId: request.headers.get('x-request-id') });
    return response({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, 503);
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (!contentLengthHeader) {
    // Reject chunked multipart bodies before parsing so an attacker cannot
    // bypass the in-memory body ceiling by omitting Content-Length.
    return response({ ok: false, error: 'CONTENT_LENGTH_REQUIRED' }, 411);
  }
  const contentLength = Number(contentLengthHeader);
  const maximumBody = (scope === 'review' ? MAX_REVIEW_IMAGE_BYTES : MAX_ADMIN_VIDEO_BYTES) + MULTIPART_OVERHEAD_BYTES;
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return response({ ok: false, error: 'INVALID_CONTENT_LENGTH' }, 400);
  }
  if (contentLength > maximumBody) return response({ ok: false, error: 'REQUEST_TOO_LARGE' }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return response({ ok: false, error: 'INVALID_FORM_DATA' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return response({ ok: false, error: 'NO_FILE' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateMediaFile({ bytes, filename: file.name, mimeType: file.type, scope });
  if (!validation.ok) {
    const status = validation.error === 'FILE_TOO_LARGE' ? 413 : 400;
    return response({ ok: false, error: validation.error }, status);
  }

  let stored: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    stored = await uploadMedia({
      bytes,
      mimeType: validation.mimeType,
      mediaType: validation.mediaType,
      scope,
    });
  } catch (error) {
    await recordAudit({ actor, action: 'media.upload', outcome: 'failure', request, metadata: { scope, reason: 'provider_failure' } });
    if (error instanceof MediaStorageUnavailableError) return response({ ok: false, error: error.code }, 503);
    logServerError({ route: 'POST /api/upload provider', err: error, requestId: request.headers.get('x-request-id') });
    return response({ ok: false, error: 'UPLOAD_PROVIDER_FAILED' }, 502);
  }

  try {
    const asset = await MediaAsset.create({
      provider: stored.provider,
      publicId: stored.publicId,
      url: stored.url,
      resourceType: stored.resourceType,
      mimeType: validation.mimeType,
      bytes: stored.bytes,
      scope,
      ownerType: actor.type,
      ownerId: actor.id,
      status: 'active',
    });
    await recordAudit({
      actor,
      action: 'media.upload',
      assetId: String(asset._id),
      outcome: 'success',
      request,
      metadata: { scope, mediaType: stored.resourceType, bytes: stored.bytes, provider: stored.provider },
    });
    return response({
      ok: true,
      assetId: String(asset._id),
      imageUrl: stored.url,
      url: stored.url,
      mediaType: stored.resourceType,
    }, 201);
  } catch (error) {
    await deleteMedia({ publicId: stored.publicId, resourceType: stored.resourceType }).catch(() => undefined);
    await recordAudit({ actor, action: 'media.upload', outcome: 'failure', request, metadata: { scope, reason: 'metadata_persistence_failure' } });
    logServerError({ route: 'POST /api/upload metadata', err: error, requestId: request.headers.get('x-request-id') });
    return response({ ok: false, error: 'UPLOAD_METADATA_FAILED' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  const authorization = await authorizeForDeletion(request);
  if (!authorization.ok) return response({ ok: false, error: authorization.error }, authorization.status);
  const { actor } = authorization;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, 400);

  let asset;
  try {
    asset = await MediaAsset.findById(parsed.data.assetId).select('+publicId').lean();
  } catch (error) {
    logServerError({ route: 'DELETE /api/upload lookup', err: error, requestId: request.headers.get('x-request-id') });
    return response({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 503);
  }
  if (!asset || asset.status === 'deleted') return response({ ok: false, error: 'ASSET_NOT_FOUND' }, 404);
  const customerOwnsUnlinkedReview = actor.type === 'customer' &&
    asset.ownerType === 'customer' && asset.ownerId === actor.id && asset.scope === 'review';
  if (actor.type !== 'admin' && !customerOwnsUnlinkedReview) return response({ ok: false, error: 'FORBIDDEN' }, 403);
  if (asset.linkedResourceId) return response({ ok: false, error: 'ASSET_IN_USE' }, 409);

  try {
    const claimed = await MediaAsset.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(parsed.data.assetId), status: 'active', linkedResourceId: null },
      { $set: { status: 'deleting' } },
      { returnDocument: 'after' },
    ).select('+publicId').lean();
    if (!claimed) return response({ ok: false, error: 'ASSET_DELETE_CONFLICT' }, 409);
    try {
      await deleteMedia({ publicId: claimed.publicId, resourceType: claimed.resourceType });
    } catch (error) {
      await MediaAsset.updateOne({ _id: claimed._id, status: 'deleting' }, { $set: { status: 'active' } }).catch(() => undefined);
      await recordAudit({ actor, action: 'media.delete', assetId: parsed.data.assetId, outcome: 'failure', request, metadata: { reason: 'provider_failure' } });
      if (error instanceof MediaStorageUnavailableError) return response({ ok: false, error: error.code }, 503);
      if (error instanceof MediaStorageOperationError) return response({ ok: false, error: 'DELETE_PROVIDER_FAILED' }, 502);
      throw error;
    }
    await MediaAsset.updateOne(
      { _id: claimed._id, status: 'deleting' },
      { $set: { status: 'deleted', deletedAt: new Date() } },
    );
    await recordAudit({ actor, action: 'media.delete', assetId: parsed.data.assetId, outcome: 'success', request, metadata: { scope: asset.scope, provider: asset.provider } });
    return response({ ok: true, assetId: parsed.data.assetId }, 200);
  } catch (error) {
    logServerError({ route: 'DELETE /api/upload', err: error, requestId: request.headers.get('x-request-id') });
    return response({ ok: false, error: 'MEDIA_DELETE_FAILED' }, 500);
  }
}
