import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { connectToMongo } from '@/lib/mongoose';
import { User } from '@/models/User';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const forgotSchema = z.object({
  email: z.string().email().max(120),
});

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 3, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await connectToMongo();
    const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashed = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.passwordResetToken = hashed;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      if (process.env.NODE_ENV === 'development') {
        console.info('[Forgot Password] Reset token for', email, ':', resetToken);
      }
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      ok: true,
      message: 'If an account exists for that email, reset instructions have been sent.',
    });
  } catch (err) {
    console.error('[POST /api/auth/forgot-password]', err);
    return NextResponse.json({ ok: false, error: 'REQUEST_FAILED' }, { status: 500 });
  }
}
