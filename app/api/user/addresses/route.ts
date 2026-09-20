import { NextResponse } from 'next/server';
import { addressSchema } from '@/lib/addressValidation';
import { logServerError } from '@/lib/apiError';
import {
  enforceCustomerMutationRateLimit,
  PRIVATE_NO_STORE_HEADERS,
  requireCurrentCustomer,
} from '@/lib/customerRouteAuth';
import { User } from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireCurrentCustomer();
  if (!auth.ok) return auth.response;
  try {
    const user = await User.findOne({ _id: auth.accountId, isActive: { $ne: false } })
      .select('_id addresses')
      .lean();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: true, addresses: user.addresses ?? [] }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'GET /api/user/addresses', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: Request) {
  const auth = await requireCurrentCustomer();
  if (!auth.ok) return auth.response;
  const limited = await enforceCustomerMutationRateLimit({ accountId: auth.accountId, scope: 'address-write' });
  if (limited) return limited;
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const parsed = addressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const user = await User.findOne({ _id: auth.accountId, isActive: { $ne: false } }).select('_id addresses');
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if ((user.addresses?.length ?? 0) >= 20) {
      return NextResponse.json({ ok: false, error: 'ADDRESS_LIMIT_REACHED' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (parsed.data.isDefault) {
      user.addresses?.forEach((address: { isDefault: boolean }) => { address.isDefault = false; });
    }
    user.addresses ??= [];
    user.addresses.push(parsed.data);
    await user.save();
    return NextResponse.json({ ok: true, addresses: user.addresses }, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'POST /api/user/addresses', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ADDRESS_CREATE_FAILED' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
