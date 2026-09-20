import { NextResponse } from 'next/server';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { distributedRateLimit } from '@/lib/rateLimit';

export const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function requireCurrentCustomer(): Promise<
  { ok: true; accountId: string } |
  { ok: false; response: NextResponse }
> {
  const state = await getCustomerSessionState();
  if (state.status === 'valid') return { ok: true, accountId: state.accountId };
  if (state.status === 'database_unavailable') {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'DATABASE_UNAVAILABLE' },
        { status: 503, headers: PRIVATE_NO_STORE_HEADERS },
      ),
    };
  }
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: state.status === 'account_disabled' ? 'ACCOUNT_DISABLED' : 'UNAUTHENTICATED' },
      { status: state.status === 'account_disabled' ? 403 : 401, headers: PRIVATE_NO_STORE_HEADERS },
    ),
  };
}

export async function enforceCustomerMutationRateLimit(input: {
  accountId: string;
  scope: string;
  limit?: number;
  windowSeconds?: number;
}): Promise<NextResponse | null> {
  try {
    const result = await distributedRateLimit(
      `${input.scope}:${input.accountId}`,
      input.limit ?? 20,
      input.windowSeconds ?? 60,
    );
    if (result.allowed) return null;
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: result.retryAfter },
      {
        status: 429,
        headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(result.retryAfter ?? input.windowSeconds ?? 60) },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMIT_UNAVAILABLE' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
