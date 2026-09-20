import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import {
  createPasswordResetToken,
  getPasswordResetDeliveryConfig,
  hashPasswordResetToken,
  PASSWORD_RESET_TTL_MS,
  sendPasswordResetEmail,
} from '@/lib/passwordReset';
import { authRateLimit } from '@/lib/authRateLimit';
import { User } from '@/models/User';

const forgotSchema = z.object({ email: z.string().trim().email().max(255) }).strict();

const acceptedMessage =
  'If an active account exists and email delivery is accepted, password reset instructions will arrive shortly.';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = forgotSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', message: 'Enter a valid email address.' }, { status: 400 });
  }

  const deliveryConfig = getPasswordResetDeliveryConfig();
  if (!deliveryConfig) {
    return NextResponse.json(
      {
        ok: false,
        error: 'PASSWORD_RESET_UNAVAILABLE',
        message: 'Password reset email delivery is not configured. Contact the site administrator.',
      },
      { status: 503 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const emailLimit = await authRateLimit({
      request, scope: 'forgot-password', subject: hashPasswordResetToken(email), limit: 3, windowSeconds: 60 * 60,
    });
    if (!emailLimit.allowed) {
      // Use the same response as an accepted request to avoid account discovery.
      return NextResponse.json({ ok: true, message: acceptedMessage }, { status: 202 });
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

  try {
    const user = await User.findOne({ email, isActive: { $ne: false } })
      .select('+passwordResetToken +passwordResetExpires');
    if (!user) {
      return NextResponse.json({ ok: true, message: acceptedMessage }, { status: 202 });
    }

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();

    try {
      await sendPasswordResetEmail({ recipient: email, token, config: deliveryConfig });
    } catch (error) {
      await User.updateOne(
        { _id: user._id, passwordResetToken: tokenHash },
        { $set: { passwordResetToken: null, passwordResetExpires: null } },
      ).catch(() => undefined);
      console.error('[ForgotPassword] Email provider did not accept the request:', error instanceof Error ? error.message : 'unknown error');
    }

    return NextResponse.json({ ok: true, message: acceptedMessage }, { status: 202 });
  } catch (error) {
    console.error('[ForgotPassword] Request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { ok: false, error: 'RESET_REQUEST_FAILED', message: 'Password reset is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
