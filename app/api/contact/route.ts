import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import { logServerError } from '@/lib/apiError';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { toPlainText } from '@/lib/plainText';
import { ADMIN_COOKIE_NAME, verifyAdminTokenState, type AdminSessionState } from '@/lib/adminJwt';
import { AuditEvent } from '@/models/AuditEvent';
import { ContactMessage } from '@/models/ContactMessage';

const MAX_BODY_BYTES = 8 * 1024;

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(20).regex(/^[0-9+().\-\s]*$/, 'Invalid phone format').optional().default(''),
  subject: z.enum(['order', 'feedback', 'catering', 'press', 'other']).optional().default('other'),
  message: z.string().trim().min(10).max(2000),
  website: z.string().trim().max(200).optional().default(''),
}).strict();

const adminListSchema = z.object({
  status: z.enum(['all', 'new', 'read', 'replied']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const adminUpdateSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(['new', 'read', 'replied']),
  adminNote: z.string().trim().max(1000).optional().nullable(),
}).strict();

type ValidAdmin = Extract<AdminSessionState, { status: 'valid' }>;

async function adminSession(request: NextRequest): Promise<AdminSessionState> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return token ? verifyAdminTokenState(token) : { status: 'invalid' };
}

function canManageContacts(admin: ValidAdmin): boolean {
  return admin.permissions.includes('*') || admin.permissions.includes('contacts:manage');
}

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...headers },
  });
}

async function readJsonBody(request: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return { ok: false, status: 415, error: 'UNSUPPORTED_MEDIA_TYPE' };

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'BODY_TOO_LARGE' };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'BODY_TOO_LARGE' };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 400, error: 'INVALID_JSON' };
  }
}

export async function GET(request: NextRequest) {
  const state = await adminSession(request);
  if (state.status === 'database_unavailable') return json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 503);
  if (state.status !== 'valid') return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
  if (!canManageContacts(state)) return json({ ok: false, error: 'FORBIDDEN' }, 403);

  const rawQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = adminListSchema.safeParse(rawQuery);
  if (!parsed.success) return json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten().fieldErrors }, 400);

  try {
    const limited = await distributedRateLimit(`contact-admin-list:${state.accountId}`, 60, 60);
    if (!limited.allowed) return json({ ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter }, 429, { 'Retry-After': String(limited.retryAfter) });
    const filter = parsed.data.status === 'all' ? {} : { status: parsed.data.status };
    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .select('name email phone subject message status adminNote handledAt handledBy createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((parsed.data.page - 1) * parsed.data.limit)
        .limit(parsed.data.limit)
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);
    return json({
      ok: true,
      messages: messages.map(message => ({
        id: String(message._id),
        name: message.name,
        email: message.email,
        phone: message.phone,
        subject: message.subject,
        message: message.message,
        status: message.status,
        adminNote: message.adminNote ?? null,
        handledAt: message.handledAt ?? null,
        handledBy: message.handledBy ? String(message.handledBy) : null,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      })),
      total,
      page: parsed.data.page,
      limit: parsed.data.limit,
      pages: Math.ceil(total / parsed.data.limit),
    });
  } catch (error) {
    logServerError({ route: 'GET /api/contact', err: error, requestId: request.headers.get('x-request-id') });
    return json({ ok: false, error: 'CONTACT_MESSAGES_UNAVAILABLE' }, 503);
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id');
  const clientIp = getClientIp(request);
  let rateCheck;

  try {
    rateCheck = await distributedRateLimit(`contact:${clientIp}`, 5, 60);
  } catch (error) {
    logServerError({ route: 'POST /api/contact rate-limit', err: error, requestId });
    return json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, 503);
  }

  if (!rateCheck.allowed) {
    return json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: rateCheck.retryAfter },
      429,
      { 'Retry-After': String(rateCheck.retryAfter) }
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);

  const parsed = contactSchema.safeParse(body.value);
  if (!parsed.success) {
    return json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  if (parsed.data.website) return json({ ok: false, error: 'SPAM' }, 400);

  const cleanName = toPlainText(parsed.data.name);
  const cleanMessage = toPlainText(parsed.data.message);
  if (cleanName.length < 2 || cleanMessage.length < 10) {
    return json({ ok: false, error: 'VALIDATION_FAILED' }, 400);
  }

  try {
    await connectToMongo();
    await ContactMessage.create({
      name: cleanName,
      email: parsed.data.email,
      phone: toPlainText(parsed.data.phone),
      subject: parsed.data.subject,
      message: cleanMessage,
      status: 'new',
    });

    return json({ ok: true, message: 'Message received and recorded for authorized follow-up.' });
  } catch (error) {
    logServerError({ route: 'POST /api/contact', err: error, requestId });
    return json({ ok: false, error: 'SUBMIT_FAILED' }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const state = await adminSession(request);
  if (state.status === 'database_unavailable') return json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 503);
  if (state.status !== 'valid') return json({ ok: false, error: 'UNAUTHENTICATED' }, 401);
  if (!canManageContacts(state)) return json({ ok: false, error: 'FORBIDDEN' }, 403);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const parsed = adminUpdateSchema.safeParse(body.value);
  if (!parsed.success) return json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten().fieldErrors }, 400);

  try {
    const limited = await distributedRateLimit(`contact-admin-update:${state.accountId}`, 30, 60);
    if (!limited.allowed) return json({ ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter }, 429, { 'Retry-After': String(limited.retryAfter) });
    const adminNote = parsed.data.adminNote ? toPlainText(parsed.data.adminNote) : null;
    const handled = parsed.data.status !== 'new';
    const updated = await ContactMessage.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(parsed.data.id) },
      {
        $set: {
          status: parsed.data.status,
          adminNote,
          handledAt: handled ? new Date() : null,
          handledBy: handled ? new mongoose.Types.ObjectId(state.accountId) : null,
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    await AuditEvent.create({
      actorType: 'admin',
      actorId: state.accountId,
      action: 'contact.update',
      resourceType: 'contact_message',
      resourceId: parsed.data.id,
      correlationId: request.headers.get('x-request-id'),
      outcome: 'success',
      metadata: { status: parsed.data.status, noteRecorded: Boolean(adminNote) },
    }).catch(() => undefined);
    return json({
      ok: true,
      message: {
        id: String(updated._id),
        status: updated.status,
        adminNote: updated.adminNote ?? null,
        handledAt: updated.handledAt ?? null,
        handledBy: updated.handledBy ? String(updated.handledBy) : null,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    logServerError({ route: 'PATCH /api/contact', err: error, requestId: request.headers.get('x-request-id') });
    return json({ ok: false, error: 'CONTACT_MESSAGE_UPDATE_FAILED' }, 500);
  }
}
