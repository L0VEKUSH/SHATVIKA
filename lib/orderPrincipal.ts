import mongoose from 'mongoose';
import type { NextRequest } from 'next/server';
import { CUSTOMER_COOKIE_NAME, verifyCustomerTokenState } from '@/lib/customerJwt';
import { ensureGuestSession, getGuestSessionFromRequest, type IssuedGuestSession } from '@/lib/guestSession';
import { connectToMongo } from '@/lib/mongoose';
import { User } from '@/models/User';

export type AccountIdentityType = 'google' | 'registered';

export type OrderPrincipal =
  | {
      kind: 'account';
      accountId: string;
      identityType: AccountIdentityType;
    }
  | {
      kind: 'guest';
      guestSessionId: string;
      identityType: 'guest';
      issuedSession: IssuedGuestSession;
    };

export class OrderPrincipalError extends Error {
  constructor(readonly code: 'DATABASE_UNAVAILABLE' | 'UNAUTHENTICATED', readonly status: number) {
    super(code);
    this.name = 'OrderPrincipalError';
  }
}

export function orderOwnershipFilter(principal: OrderPrincipal): Record<string, unknown> {
  if (principal.kind === 'guest') return { guestSessionId: new mongoose.Types.ObjectId(principal.guestSessionId) };
  const accountId = new mongoose.Types.ObjectId(principal.accountId);
  return { $or: [{ userId: accountId }, { claimedByUserId: accountId }] };
}

export async function resolveOrderPrincipal(
  request: NextRequest,
  { createGuest = false }: { createGuest?: boolean } = {},
): Promise<OrderPrincipal | null> {
  const customerToken = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (customerToken) {
    const state = await verifyCustomerTokenState(customerToken);
    if (state.status === 'database_unavailable') throw new OrderPrincipalError('DATABASE_UNAVAILABLE', 503);
    if (state.status === 'valid') {
      await connectToMongo();
      const user = await User.findById(state.accountId).select('authProvider googleSubject isActive').lean();
      if (!user || user.isActive === false) return null;
      return {
        kind: 'account',
        accountId: state.accountId,
        identityType: user.authProvider === 'google' ? 'google' : 'registered',
      };
    }
  }

  const guest = createGuest
    ? await ensureGuestSession(request)
    : await getGuestSessionFromRequest(request, { touch: true });
  if (!guest) return null;
  return {
    kind: 'guest',
    guestSessionId: guest.id,
    identityType: 'guest',
    issuedSession: guest,
  };
}
