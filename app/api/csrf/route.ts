import { NextRequest, NextResponse } from 'next/server';
import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_TTL_SECONDS,
  verifyCsrfToken,
} from '@/lib/csrf';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const current = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const verification = current ? await verifyCsrfToken(current) : { valid: false as const };
    const now = Math.floor(Date.now() / 1000);
    const canReuse = verification.valid && verification.expiresAt && verification.expiresAt > now + 5 * 60;
    const token = canReuse ? current! : await createCsrfToken();
    const expiresAt = canReuse ? verification.expiresAt! : now + CSRF_TTL_SECONDS;

    const response = NextResponse.json(
      { ok: true, csrfToken: token, expiresAt },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' } },
    );
    if (!canReuse) {
      // Deliberately readable by same-origin JavaScript for the double-submit pattern.
      response.cookies.set(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: CSRF_TTL_SECONDS,
        priority: 'high',
      });
    }
    return response;
  } catch (error) {
    console.error('[GET /api/csrf]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { ok: false, error: 'CSRF_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
