import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { logServerError } from '@/lib/apiError';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { enforceCustomerMutationRateLimit } from '@/lib/customerRouteAuth';
import { User } from '@/models/User';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  const limited = await enforceCustomerMutationRateLimit({
    accountId: state.accountId,
    scope: 'cart-sync',
    limit: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: 'INVALID_MENU_ITEM_ID' }, { status: 400 });
  }
  try {
    const result = await User.updateOne(
      { _id: state.accountId, isActive: { $ne: false } },
      { $pull: { 'cart.items': { menuItemId: new mongoose.Types.ObjectId(id) } }, $set: { 'cart.lastUpdated': new Date() } },
    );
    if (result.matchedCount !== 1) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: '/api/user/cart/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}
