import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { logServerError } from '@/lib/apiError';
import { User } from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  try {
    const user = await User.findById(state.accountId)
      .select('email fullName phone profilePhoto addresses joinedDate createdAt updatedAt isActive authProvider +googleSubject')
      .lean();
    if (!user || user.isActive === false) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    return NextResponse.json({
      ok: true,
      user: {
        id: String(user._id), email: user.email, fullName: user.fullName, phone: user.phone ?? null,
        profilePhoto: user.profilePhoto ?? null, addresses: user.addresses ?? [], joinedDate: user.joinedDate,
        authProvider: user.authProvider === 'google' ? 'google' : 'password', googleLinked: Boolean(user.googleSubject),
        createdAt: user.createdAt, updatedAt: user.updatedAt,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'GET /api/auth/me', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}
