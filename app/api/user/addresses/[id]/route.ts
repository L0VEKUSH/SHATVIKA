import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { addressUpdateSchema } from '@/lib/addressValidation';
import { logServerError } from '@/lib/apiError';
import {
  enforceCustomerMutationRateLimit,
  PRIVATE_NO_STORE_HEADERS,
  requireCurrentCustomer,
} from '@/lib/customerRouteAuth';
import { User } from '@/models/User';

export const dynamic = 'force-dynamic';

type MutableAddress = {
  _id?: { toString(): string };
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  isDefault: boolean;
};

async function addressRequestContext(params: Promise<{ id: string }>) {
  const auth = await requireCurrentCustomer();
  if (!auth.ok) return auth;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'INVALID_ADDRESS_ID' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      ),
    };
  }
  return { ok: true as const, accountId: auth.accountId, addressId: id };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await addressRequestContext(params);
  if (!context.ok) return context.response;
  try {
    const user = await User.findOne({ _id: context.accountId, isActive: { $ne: false } })
      .select('_id addresses')
      .lean();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const addresses = (user.addresses ?? []) as unknown as MutableAddress[];
    const address = addresses.find((entry) => String(entry._id) === context.addressId);
    if (!address) {
      return NextResponse.json({ ok: false, error: 'ADDRESS_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ ok: true, address }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'GET /api/user/addresses/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await addressRequestContext(params);
  if (!context.ok) return context.response;
  const limited = await enforceCustomerMutationRateLimit({ accountId: context.accountId, scope: 'address-write' });
  if (limited) return limited;
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const parsed = addressUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const user = await User.findOne({ _id: context.accountId, isActive: { $ne: false } }).select('_id addresses');
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const addresses = (user.addresses ?? []) as unknown as MutableAddress[];
    const address = addresses.find((entry) => String(entry._id) === context.addressId);
    if (!address) {
      return NextResponse.json({ ok: false, error: 'ADDRESS_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (parsed.data.isDefault === true) {
      addresses.forEach((entry) => { entry.isDefault = false; });
    }
    Object.assign(address, parsed.data);
    await user.save();
    return NextResponse.json({ ok: true, address, addresses: user.addresses }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'PUT /api/user/addresses/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ADDRESS_UPDATE_FAILED' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await addressRequestContext(params);
  if (!context.ok) return context.response;
  const limited = await enforceCustomerMutationRateLimit({ accountId: context.accountId, scope: 'address-write' });
  if (limited) return limited;

  try {
    const user = await User.findOne({ _id: context.accountId, isActive: { $ne: false } }).select('_id addresses');
    if (!user) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const addresses = (user.addresses ?? []) as unknown as MutableAddress[];
    const index = addresses.findIndex((entry) => String(entry._id) === context.addressId);
    if (index < 0) {
      return NextResponse.json({ ok: false, error: 'ADDRESS_NOT_FOUND' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (addresses.length === 1) {
      return NextResponse.json({ ok: false, error: 'ONLY_ADDRESS_CANNOT_BE_DELETED' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const [removed] = addresses.splice(index, 1);
    if (removed.isDefault && addresses.length > 0) addresses[0].isDefault = true;
    await user.save();
    return NextResponse.json({ ok: true, addresses: user.addresses }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    logServerError({ route: 'DELETE /api/user/addresses/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ADDRESS_DELETE_FAILED' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
