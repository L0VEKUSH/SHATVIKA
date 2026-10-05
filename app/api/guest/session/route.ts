import { NextRequest, NextResponse } from 'next/server';
import { logServerError } from '@/lib/apiError';
import { applyGuestSessionCookie, ensureGuestSession } from '@/lib/guestSession';

export const dynamic = 'force-dynamic';

/**
 * Establishes ownership before checkout. This separate response makes an
 * ambiguous order timeout retryable against the same server-side guest owner.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await ensureGuestSession(request);
    const response = NextResponse.json(
      { ok: true, historyScope: 'this_browser', expiresAt: session.expiresAt.toISOString() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
    applyGuestSessionCookie(response, session);
    return response;
  } catch (error) {
    logServerError({ route: 'GET /api/guest/session', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'GUEST_SESSION_UNAVAILABLE' }, { status: 503 });
  }
}
