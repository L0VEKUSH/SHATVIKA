import { NextRequest, NextResponse } from 'next/server';
import { clearCustomerSession } from '@/lib/customerAuth';
import { logServerError } from '@/lib/apiError';
import { clearGuestSessionCookie, revokeGuestSession } from '@/lib/guestSession';

export async function POST(request: NextRequest) {
  try {
    await revokeGuestSession(request);
    await clearCustomerSession();
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    clearGuestSessionCookie(response);
    return response;
  } catch (error) {
    logServerError({ route: 'POST /api/auth/logout', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'LOGOUT_FAILED' }, { status: 500 });
  }
}
