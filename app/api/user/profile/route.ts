import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError } from '@/lib/apiError';
import { PRIVATE_NO_STORE_HEADERS, requireCurrentCustomer } from '@/lib/customerRouteAuth';
import { User } from '@/models/User';

export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^\d{10,15}$/).optional(),
  profilePhoto: z.union([
    z.literal(''),
    z.string().trim().url().max(2_048).refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required'),
  ]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one supported field is required');

function publicUser(user: Record<string, unknown>) {
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || null,
    profilePhoto: user.profilePhoto || null,
    addresses: user.addresses || [],
    joinedDate: user.joinedDate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function GET(request: Request) {
  const auth = await requireCurrentCustomer();
  if (!auth.ok) return auth.response;

  try {
    const user = await User.findOne({ _id: auth.accountId, isActive: { $ne: false } })
      .select('_id email fullName phone profilePhoto addresses joinedDate createdAt updatedAt')
      .lean() as Record<string, unknown> | null;
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: true, user: publicUser(user) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'GET /api/user/profile', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: Request) {
  const auth = await requireCurrentCustomer();
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const updates: Record<string, string | null> = { ...parsed.data };
  if (parsed.data.profilePhoto === '') updates.profilePhoto = null;

  try {
    const user = await User.findOneAndUpdate(
      { _id: auth.accountId, isActive: { $ne: false } },
      { $set: updates },
      { returnDocument: 'after', runValidators: true },
    ).select('_id email fullName phone profilePhoto addresses joinedDate createdAt updatedAt').lean() as Record<string, unknown> | null;
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: true, user: publicUser(user) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'PUT /api/user/profile', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'PROFILE_UPDATE_FAILED' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
