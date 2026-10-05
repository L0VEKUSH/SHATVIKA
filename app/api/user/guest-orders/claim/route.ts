import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { clearGuestSessionCookie, guestSessionHashFromRequest } from '@/lib/guestSession';
import { connectToMongo } from '@/lib/mongoose';
import { GuestSession } from '@/models/GuestSession';
import { Order } from '@/models/Order';
import { User } from '@/models/User';

async function context(request: NextRequest) {
  const customer = await getCustomerSessionState();
  if (customer.status !== 'valid') return { error: customer.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED', status: customer.status === 'database_unavailable' ? 503 : 401 } as const;
  const tokenHash = guestSessionHashFromRequest(request);
  if (!tokenHash) return { customerId: customer.accountId, tokenHash: null, identityType: 'registered' as const };
  const user = await User.findById(customer.accountId).select('authProvider isActive').lean();
  if (!user || user.isActive === false) return { error: 'UNAUTHENTICATED', status: 401 } as const;
  return { customerId: customer.accountId, tokenHash, identityType: user.authProvider === 'google' ? 'google' as const : 'registered' as const };
}

export async function GET(request: NextRequest) {
  try {
    await connectToMongo();
    const result = await context(request);
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    if (!result.tokenHash) return NextResponse.json({ ok: true, available: 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
    const guest = await GuestSession.findOne({ tokenHash: result.tokenHash, expiresAt: { $gt: new Date() } }).select('_id claimedByUserId revokedAt').lean();
    if (!guest || guest.revokedAt || guest.claimedByUserId) return NextResponse.json({ ok: true, available: 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
    const available = await Order.countDocuments({ guestSessionId: guest._id, claimedByUserId: null });
    return NextResponse.json({ ok: true, available }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'GUEST_ORDER_CLAIM_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToMongo();
    const result = await context(request);
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    if (!result.tokenHash) return NextResponse.json({ ok: false, error: 'NO_GUEST_SESSION' }, { status: 404 });

    const dbSession = await mongoose.startSession();
    let claimed = 0;
    let alreadyClaimed = false;
    try {
      await dbSession.withTransaction(async () => {
        const guest = await GuestSession.findOne({ tokenHash: result.tokenHash, expiresAt: { $gt: new Date() } }).session(dbSession);
        if (!guest) throw new Error('NO_GUEST_SESSION');
        if (guest.claimedByUserId) {
          if (String(guest.claimedByUserId) !== result.customerId) throw new Error('GUEST_SESSION_ALREADY_CLAIMED');
          alreadyClaimed = true;
          return;
        }
        if (guest.revokedAt) throw new Error('NO_GUEST_SESSION');
        const accountId = new mongoose.Types.ObjectId(result.customerId);
        const update = await Order.updateMany(
          { guestSessionId: guest._id, claimedByUserId: null },
          { $set: { claimedByUserId: accountId, claimedAt: new Date(), customerIdentityType: result.identityType } },
          { session: dbSession },
        );
        claimed = update.modifiedCount;
        guest.claimedByUserId = accountId;
        guest.claimedAt = new Date();
        guest.revokedAt = new Date();
        await guest.save({ session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }
    const response = NextResponse.json({ ok: true, claimed, alreadyClaimed }, { headers: { 'Cache-Control': 'private, no-store' } });
    clearGuestSessionCookie(response);
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'NO_GUEST_SESSION') return NextResponse.json({ ok: false, error: code }, { status: 404 });
    if (code === 'GUEST_SESSION_ALREADY_CLAIMED') return NextResponse.json({ ok: false, error: code }, { status: 409 });
    return NextResponse.json({ ok: false, error: 'GUEST_ORDER_CLAIM_FAILED' }, { status: 500 });
  }
}
