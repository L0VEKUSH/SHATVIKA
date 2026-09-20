import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState, type AdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { AuditEvent } from '@/models/AuditEvent';
import { GalleryItem } from '@/models/Content';
import { MediaAsset } from '@/models/MediaAsset';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const httpsUrl = z.string().trim().min(1).max(2048).refine(value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:');
  } catch { return false; }
}, 'Use a durable HTTPS URL');
const fields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(['Food', 'Restaurant', 'Team', 'Events']),
  imageUrl: httpsUrl,
  imageType: z.enum(['image', 'video', 'youtube']),
  youtubeId: z.string().trim().regex(/^[A-Za-z0-9_-]{11}$/).optional().nullable(),
  mediaAssetId: idSchema.optional().nullable(),
  featured: z.boolean().optional(),
  order: z.number().int().min(0).max(1_000_000).optional(),
};
const createSchema = z.object(fields).strict();
const updateSchema = z.object(fields).partial().strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');
const reorderSchema = z.object({
  items: z.array(z.object({ id: idSchema, order: z.number().int().min(0).max(1_000_000) }).strict())
    .min(1).max(200),
}).strict().superRefine((value, context) => {
  if (new Set(value.items.map(item => item.id)).size !== value.items.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Gallery IDs must be unique' });
  }
});

type ValidAdmin = Extract<AdminSessionState, { status: 'valid' }>;

function canManage(admin: ValidAdmin) {
  return admin.permissions.includes('*') || admin.permissions.includes('media:manage');
}

async function requireAdmin(): Promise<ValidAdmin | NextResponse> {
  const state = await getAdminSessionState();
  if (state.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (state.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401, headers: PRIVATE_HEADERS });
  }
  if (!canManage(state)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403, headers: PRIVATE_HEADERS });
  }
  return state;
}

function serialize(item: any) {
  return {
    id: String(item._id ?? item.id),
    title: item.title,
    description: item.description ?? '',
    category: item.category,
    imageUrl: item.imageUrl,
    imageType: item.imageType,
    youtubeId: item.youtubeId ?? null,
    featured: Boolean(item.featured),
    order: Number(item.order ?? 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function mutationLimit(admin: ValidAdmin) {
  return distributedRateLimit(`gallery-mutation:${admin.accountId}`, 60, 60);
}

async function audit(admin: ValidAdmin, request: NextRequest, action: string, resourceId: string, metadata: Record<string, unknown>) {
  await AuditEvent.create({
    actorType: 'admin', actorId: admin.accountId, action, resourceType: 'gallery_item', resourceId,
    correlationId: request.headers.get('x-request-id'), outcome: 'success', metadata,
  }).catch(() => undefined);
}

function transactionUnavailable(error: unknown) {
  return /Transaction numbers are only allowed|replica set|Transaction support/i.test(error instanceof Error ? error.message : '');
}

async function claimAsset(input: {
  assetId: string;
  adminId: string;
  url: string;
  imageType: 'image' | 'video';
  galleryId: string;
  session: mongoose.ClientSession;
}) {
  return MediaAsset.findOneAndUpdate({
    _id: input.assetId,
    ownerType: 'admin',
    ownerId: input.adminId,
    scope: 'admin-gallery',
    status: 'active',
    linkedResourceId: null,
    url: input.url,
    resourceType: input.imageType,
  }, {
    $set: { linkedResourceType: 'gallery', linkedResourceId: input.galleryId },
  }, { returnDocument: 'after', session: input.session }).lean();
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  if (category && !['Food', 'Restaurant', 'Team', 'Events'].includes(category)) {
    return NextResponse.json({ ok: false, error: 'INVALID_CATEGORY' }, { status: 400 });
  }
  const featured = request.nextUrl.searchParams.get('featured');
  if (featured && featured !== 'true' && featured !== 'false') {
    return NextResponse.json({ ok: false, error: 'INVALID_FEATURED_FILTER' }, { status: 400 });
  }
  const sort = request.nextUrl.searchParams.get('sort') ?? 'order';
  if (!['order', 'newest'].includes(sort)) return NextResponse.json({ ok: false, error: 'INVALID_SORT' }, { status: 400 });
  const parsedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 100);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    return NextResponse.json({ ok: false, error: 'INVALID_LIMIT' }, { status: 400 });
  }
  try {
    const rate = await distributedRateLimit(`gallery-read:${getClientIp(request)}`, 60, 60);
    if (!rate.allowed) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryAfter: rate.retryAfter }, {
        status: 429, headers: { 'Retry-After': String(rate.retryAfter ?? 60) },
      });
    }
    await connectToMongo();
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (featured) filter.featured = featured === 'true';
    const [items, total] = await Promise.all([
      GalleryItem.find(filter).sort(sort === 'newest' ? { createdAt: -1, _id: -1 } : { featured: -1, order: 1, _id: 1 })
        .limit(parsedLimit).lean(),
      GalleryItem.countDocuments(filter),
    ]);
    return NextResponse.json({ ok: true, items: items.map(serialize), total }, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    logServerError({ route: 'GET /api/gallery', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GALLERY_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400, headers: PRIVATE_HEADERS });
  const input = parsed.data;
  if (input.imageType === 'youtube' ? !input.youtubeId || Boolean(input.mediaAssetId) : !input.mediaAssetId || Boolean(input.youtubeId)) {
    return NextResponse.json({ ok: false, error: 'MEDIA_CONTRACT_MISMATCH' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  try {
    const rate = await mutationLimit(admin);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfter ?? 60) } });
    const session = await mongoose.startSession();
    let created: any;
    try {
      await session.withTransaction(async () => {
        const id = new mongoose.Types.ObjectId();
        if (input.imageType !== 'youtube') {
          const claimed = await claimAsset({
            assetId: input.mediaAssetId!, adminId: admin.accountId, url: input.imageUrl,
            imageType: input.imageType, galleryId: String(id), session,
          });
          if (!claimed) throw new GalleryError('MEDIA_ASSET_NOT_AVAILABLE', 409);
        }
        const finalOrder = input.order ?? Number((await GalleryItem.findOne().sort({ order: -1 }).select('order').session(session).lean())?.order ?? -1) + 1;
        [created] = await GalleryItem.create([{
          _id: id, title: input.title, description: input.description ?? '', category: input.category,
          imageUrl: input.imageUrl, imageType: input.imageType, youtubeId: input.youtubeId ?? null,
          mediaAssetId: input.imageType === 'youtube' ? null : input.mediaAssetId,
          featured: input.featured ?? false, order: finalOrder,
        }], { session });
      });
    } finally { await session.endSession(); }
    await audit(admin, request, 'gallery.create', String(created._id), { mediaType: input.imageType });
    return NextResponse.json({ ok: true, id: String(created._id), item: serialize(created) }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof GalleryError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
    if (transactionUnavailable(error)) return NextResponse.json({ ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' }, { status: 503, headers: PRIVATE_HEADERS });
    logServerError({ route: 'POST /api/gallery', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GALLERY_CREATE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400, headers: PRIVATE_HEADERS });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const rate = await mutationLimit(admin);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfter ?? 60) } });
    const session = await mongoose.startSession();
    let updated: any;
    try {
      await session.withTransaction(async () => {
        const existing = await GalleryItem.findById(id).session(session);
        if (!existing) throw new GalleryError('NOT_FOUND', 404);
        const nextType = parsed.data.imageType ?? existing.imageType;
        const nextUrl = parsed.data.imageUrl ?? existing.imageUrl;
        const changesMedia = nextType !== existing.imageType || nextUrl !== existing.imageUrl;
        if (changesMedia) {
          if (nextType === 'youtube') {
            const youtubeId = parsed.data.youtubeId ?? existing.youtubeId;
            if (!youtubeId || parsed.data.mediaAssetId) throw new GalleryError('MEDIA_CONTRACT_MISMATCH', 400);
          } else {
            if (!parsed.data.mediaAssetId || parsed.data.youtubeId) throw new GalleryError('MEDIA_CONTRACT_MISMATCH', 400);
            const claimed = await claimAsset({
              assetId: parsed.data.mediaAssetId, adminId: admin.accountId, url: nextUrl,
              imageType: nextType as 'image' | 'video', galleryId: id, session,
            });
            if (!claimed) throw new GalleryError('MEDIA_ASSET_NOT_AVAILABLE', 409);
          }
          if (existing.mediaAssetId) {
            await MediaAsset.updateOne(
              { _id: existing.mediaAssetId, linkedResourceType: 'gallery', linkedResourceId: id },
              { $set: { linkedResourceType: null, linkedResourceId: null } },
              { session },
            );
          }
        } else if (parsed.data.mediaAssetId && String(existing.mediaAssetId ?? '') !== parsed.data.mediaAssetId) {
          throw new GalleryError('MEDIA_CONTRACT_MISMATCH', 400);
        }
        const update: Record<string, unknown> = { ...parsed.data };
        if (changesMedia) update.mediaAssetId = nextType === 'youtube' ? null : parsed.data.mediaAssetId;
        else delete update.mediaAssetId;
        Object.assign(existing, update);
        await existing.save({ session });
        updated = existing;
      });
    } finally { await session.endSession(); }
    await audit(admin, request, 'gallery.update', id, { fields: Object.keys(parsed.data).join(',') });
    return NextResponse.json({ ok: true, id, item: serialize(updated) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof GalleryError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
    if (transactionUnavailable(error)) return NextResponse.json({ ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' }, { status: 503, headers: PRIVATE_HEADERS });
    logServerError({ route: 'PUT /api/gallery', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GALLERY_UPDATE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const rate = await mutationLimit(admin);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfter ?? 60) } });
    const session = await mongoose.startSession();
    let hadAsset = false;
    try {
      await session.withTransaction(async () => {
        const deleted = await GalleryItem.findByIdAndDelete(id, { session }).lean();
        if (!deleted) throw new GalleryError('NOT_FOUND', 404);
        hadAsset = Boolean(deleted.mediaAssetId);
        if (deleted.mediaAssetId) {
          // The durable object is preserved. Deletion requires a separate,
          // deliberate DELETE /api/upload call after it becomes unlinked.
          await MediaAsset.updateOne(
            { _id: deleted.mediaAssetId, linkedResourceType: 'gallery', linkedResourceId: id },
            { $set: { linkedResourceType: null, linkedResourceId: null } },
            { session },
          );
        }
      });
    } finally { await session.endSession(); }
    await audit(admin, request, 'gallery.delete', id, { mediaPreserved: hadAsset });
    return NextResponse.json({ ok: true, id, mediaPreserved: hadAsset }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof GalleryError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
    if (transactionUnavailable(error)) return NextResponse.json({ ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' }, { status: 503, headers: PRIVATE_HEADERS });
    logServerError({ route: 'DELETE /api/gallery', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GALLERY_DELETE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const rate = await mutationLimit(admin);
    if (!rate.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfter ?? 60) } });
    const ids = parsed.data.items.map(item => new mongoose.Types.ObjectId(item.id));
    if (await GalleryItem.countDocuments({ _id: { $in: ids } }) !== ids.length) {
      return NextResponse.json({ ok: false, error: 'STALE_GALLERY_LIST' }, { status: 409, headers: PRIVATE_HEADERS });
    }
    await GalleryItem.bulkWrite(parsed.data.items.map(item => ({
      updateOne: { filter: { _id: new mongoose.Types.ObjectId(item.id) }, update: { $set: { order: item.order } } },
    })), { ordered: true });
    await audit(admin, request, 'gallery.reorder', 'multiple', { count: parsed.data.items.length });
    return NextResponse.json({ ok: true, updated: parsed.data.items }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    logServerError({ route: 'PATCH /api/gallery', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GALLERY_REORDER_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

class GalleryError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'GalleryError';
  }
}
