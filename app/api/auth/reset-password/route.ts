import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearCustomerSession } from '@/lib/customerAuth';
import { connectToMongo } from '@/lib/mongoose';
import { hashPasswordResetToken, isPasswordResetTokenFormat } from '@/lib/passwordReset';
import { authRateLimit } from '@/lib/authRateLimit';
import { validatePassword } from '@/lib/validators';
import { User } from '@/models/User';

const resetSchema = z.object({
  token: z.string().length(64),
  password: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = resetSchema.safeParse(payload);
  if (!parsed.success || !isPasswordResetTokenFormat(parsed.data?.token ?? '')) {
    return NextResponse.json({ ok: false, error: 'INVALID_RESET_REQUEST', message: 'The reset link is invalid.' }, { status: 400 });
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return NextResponse.json({ ok: false, error: 'PASSWORDS_DO_NOT_MATCH', message: 'Passwords do not match.' }, { status: 400 });
  }
  const passwordValidation = validatePassword(parsed.data.password);
  if (!passwordValidation.valid) {
    return NextResponse.json(
      { ok: false, error: 'WEAK_PASSWORD', message: 'Password does not meet requirements.', details: passwordValidation.errors },
      { status: 400 },
    );
  }

  try {
    const limit = await authRateLimit({
      request, scope: 'reset-password', subject: hashPasswordResetToken(parsed.data.token), limit: 5, windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', message: 'Too many reset attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 900) } },
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE', message: 'Password reset is temporarily unavailable.' }, { status: 503 });
  }

  try {
    await connectToMongo();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'DB_UNAVAILABLE', message: 'Password reset is temporarily unavailable.' },
      { status: 503 },
    );
  }

  const tokenHash = hashPasswordResetToken(parsed.data.token.toLowerCase());
  try {
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
      isActive: { $ne: false },
    }).select('+password +passwordResetToken +passwordResetExpires');

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'RESET_TOKEN_INVALID_OR_EXPIRED', message: 'This reset link is invalid, expired, or already used.' },
        { status: 400 },
      );
    }
    if (await bcrypt.compare(parsed.data.password, user.password)) {
      return NextResponse.json(
        { ok: false, error: 'PASSWORD_REUSED', message: 'Choose a password different from your current password.' },
        { status: 400 },
      );
    }

    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        passwordResetToken: tokenHash,
        passwordResetExpires: { $gt: new Date() },
      },
      {
        $set: {
          password: await bcrypt.hash(parsed.data.password, 12),
          passwordResetToken: null,
          passwordResetExpires: null,
        },
        $inc: { passwordVersion: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    ).select('_id');

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: 'RESET_TOKEN_INVALID_OR_EXPIRED', message: 'This reset link is invalid, expired, or already used.' },
        { status: 400 },
      );
    }

    // Any browser session present on this device is removed; passwordVersion
    // invalidates every other outstanding session for the account.
    await clearCustomerSession();
    return NextResponse.json({ ok: true, message: 'Password reset. Sign in with your new password.' });
  } catch (error) {
    console.error('[ResetPassword] Request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { ok: false, error: 'RESET_FAILED', message: 'Password reset is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
