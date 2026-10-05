import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { setAdminSessionForAdmin } from '@/lib/adminAuth';
import { adminSessionConfigurationError } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { authRateLimit } from '@/lib/authRateLimit';
import { logServerError } from '@/lib/apiError';
import { validateEmail, validatePassword } from '@/lib/validators';
import { Admin } from '@/models/Admin';

export const dynamic = 'force-dynamic';

function secretMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function POST(request: Request) {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== 'true') {
    return NextResponse.json(
      { ok: false, error: 'BOOTSTRAP_DISABLED', message: 'Admin bootstrap is disabled.' },
      { status: 403 },
    );
  }

  const setupSecret = process.env.ADMIN_SETUP_KEY ?? '';
  if (new TextEncoder().encode(setupSecret).byteLength < 32 || adminSessionConfigurationError()) {
    console.error('[AdminBootstrap] Required secure configuration is unavailable');
    return NextResponse.json(
      { ok: false, error: 'BOOTSTRAP_UNAVAILABLE', message: 'Admin bootstrap is not securely configured.' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const setupKey = typeof input.setupKey === 'string' ? input.setupKey : '';
  const passwordValidation = validatePassword(password);
  if (!validateEmail(email).valid || !passwordValidation.valid || password.length > 128) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', message: 'Enter a valid email and strong password.', details: passwordValidation.errors },
      { status: 400 },
    );
  }
  try {
    const limit = await authRateLimit({ request, scope: 'admin-bootstrap', subject: email, limit: 3, windowSeconds: 15 * 60 });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', message: 'Too many bootstrap attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 900) } },
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE', message: 'Admin bootstrap is temporarily unavailable.' }, { status: 503 });
  }
  if (!secretMatches(setupKey, setupSecret)) {
    return NextResponse.json({ ok: false, error: 'INVALID_SETUP_KEY', message: 'Invalid setup key.' }, { status: 401 });
  }

  try {
    await connectToMongo();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'DB_UNAVAILABLE', message: 'Admin bootstrap is temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    if (await Admin.exists({})) {
      return NextResponse.json(
        { ok: false, error: 'BOOTSTRAP_COMPLETE', message: 'The initial administrator already exists.' },
        { status: 403 },
      );
    }

    const admin = await Admin.create({
      email,
      password: await bcrypt.hash(password, 12),
      passwordVersion: 0,
      role: 'admin',
      permissions: ['*'],
      isActive: true,
      bootstrapMarker: 'initial-admin',
    });
    await setAdminSessionForAdmin(String(admin._id), admin);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const duplicateKey = typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (duplicateKey) {
      return NextResponse.json(
        { ok: false, error: 'BOOTSTRAP_COMPLETE', message: 'The initial administrator already exists.' },
        { status: 403 },
      );
    }
    logServerError({
      route: 'POST /admin/api/signup',
      err: error,
      requestId: request.headers.get('x-request-id'),
    });
    return NextResponse.json(
      { ok: false, error: 'BOOTSTRAP_FAILED', message: 'Admin bootstrap failed.' },
      { status: 500 },
    );
  }
}
