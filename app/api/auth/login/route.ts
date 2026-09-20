import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { logServerError } from '@/lib/apiError';
import { setCustomerSession } from '@/lib/customerAuth';
import { customerSessionConfigurationError } from '@/lib/customerJwt';
import { connectToMongo } from '@/lib/mongoose';
import { authRateLimit } from '@/lib/authRateLimit';
import { validateEmail } from '@/lib/validators';
import { User } from '@/models/User';

// A valid bcrypt hash keeps the not-found path computationally equivalent without
// exposing whether an email address is registered.
const FAKE_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const rememberMe = input.rememberMe === true;
  if (!validateEmail(email).valid || !password || password.length > 128) {
    return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }, { status: 401 });
  }

  try {
    const limit = await authRateLimit({ request, scope: 'customer-login', subject: email, limit: 5, windowSeconds: 60 });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE', message: 'Sign in is temporarily unavailable.' }, { status: 503 });
  }

  const sessionConfigurationError = customerSessionConfigurationError();
  if (sessionConfigurationError) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'auth_configuration_unavailable',
      route: 'POST /api/auth/login',
      reason: sessionConfigurationError.includes('not configured') ? 'missing' : 'invalid',
    }));
    return NextResponse.json(
      { ok: false, error: 'AUTH_CONFIGURATION_UNAVAILABLE', message: 'Sign in is temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    await connectToMongo();
  } catch (error) {
    logServerError({ route: 'POST /api/auth/login', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json(
      { ok: false, error: 'DB_UNAVAILABLE', message: 'Sign in is temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    const user = await User.findOne({ email })
      .select('+password +passwordVersion isActive')
      .lean();
    const passwordHash = typeof user?.password === 'string' ? user.password : FAKE_HASH;
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!user || user.isActive === false || !passwordMatches) {
      return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }, { status: 401 });
    }

    await setCustomerSession(String(user._id), user, rememberMe);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError({ route: 'POST /api/auth/login', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json(
      { ok: false, error: 'AUTH_UNAVAILABLE', message: 'Sign in is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
