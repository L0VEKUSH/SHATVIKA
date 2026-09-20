import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { setCustomerSession } from '@/lib/customerAuth';
import { customerSessionConfigurationError } from '@/lib/customerJwt';
import { connectToMongo } from '@/lib/mongoose';
import { authRateLimit } from '@/lib/authRateLimit';
import { validateEmail, validateFullName, validatePassword, validatePhone } from '@/lib/validators';
import { User } from '@/models/User';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';

  const emailValidation = validateEmail(email);
  const passwordValidation = validatePassword(password);
  const fullNameValidation = validateFullName(fullName);
  const phoneValidation = validatePhone(phone);
  if (!emailValidation.valid) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', message: emailValidation.error }, { status: 400 });
  }
  if (!passwordValidation.valid || password.length > 128) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', message: 'Password does not meet requirements', details: passwordValidation.errors },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', message: 'Passwords do not match' }, { status: 400 });
  }
  if (!fullNameValidation.valid) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', message: fullNameValidation.error }, { status: 400 });
  }
  if (!phoneValidation.valid) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', message: phoneValidation.error }, { status: 400 });
  }
  try {
    const limit = await authRateLimit({ request, scope: 'customer-signup', subject: email, limit: 5, windowSeconds: 60 });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', message: 'Too many signup attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE', message: 'Account creation is temporarily unavailable.' }, { status: 503 });
  }
  if (customerSessionConfigurationError()) {
    return NextResponse.json(
      { ok: false, error: 'AUTH_UNAVAILABLE', message: 'Account creation is temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    await connectToMongo();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'DB_UNAVAILABLE', message: 'Account creation is temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    if (await User.exists({ email })) {
      return NextResponse.json(
        { ok: false, error: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' },
        { status: 409 },
      );
    }

    const user = await User.create({
      email,
      password: await bcrypt.hash(password, 12),
      passwordVersion: 0,
      fullName,
      phone,
      joinedDate: new Date(),
      preference: { currency: 'INR', language: 'EN' },
    });
    await setCustomerSession(String(user._id), user, false);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const duplicateKey = typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (duplicateKey) {
      return NextResponse.json(
        { ok: false, error: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' },
        { status: 409 },
      );
    }
    console.error('[CustomerSignup] Account creation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { ok: false, error: 'SIGNUP_FAILED', message: 'Account creation is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
