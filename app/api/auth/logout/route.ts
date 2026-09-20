import { NextRequest, NextResponse } from 'next/server';
import { clearCustomerSession } from '@/lib/customerAuth';
import { logServerError } from '@/lib/apiError';

export async function POST(request: NextRequest) {
  try {
    await clearCustomerSession();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'POST /api/auth/logout', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'LOGOUT_FAILED' }, { status: 500 });
  }
}
