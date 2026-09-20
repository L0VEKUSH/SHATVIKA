import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSessionState, setCustomerJwtSession } from '@/lib/customerJwt';
import { distributedRateLimit } from '@/lib/rateLimit';

export async function POST(_request: NextRequest) {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  try {
    const limited = await distributedRateLimit(`session-refresh:${state.accountId}`, 10, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
    const remembered = state.claims.exp - state.claims.iat > 24 * 60 * 60;
    await setCustomerJwtSession(state.accountId, { passwordVersion: state.claims.sv }, remembered);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'SESSION_REFRESH_UNAVAILABLE' }, { status: 503 });
  }
}
