import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clearCustomerSession } from '@/lib/customerAuth';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { logServerError } from '@/lib/apiError';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/validators';
import { AuditEvent } from '@/models/AuditEvent';
import { User } from '@/models/User';

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
}).strict();

export async function POST(request: NextRequest) {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  try {
    const limited = await distributedRateLimit(
      `change-password:${state.accountId}:${getClientIp(request)}`,
      5,
      15 * 60,
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 900) } },
      );
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.newPassword !== parsed.data.confirmPassword) {
      return NextResponse.json({ ok: false, error: 'PASSWORDS_DO_NOT_MATCH' }, { status: 400 });
    }
    const strength = validatePassword(parsed.data.newPassword);
    if (!strength.valid) {
      return NextResponse.json({ ok: false, error: 'WEAK_PASSWORD', details: strength.errors }, { status: 400 });
    }
    const user = await User.findById(state.accountId).select('+password +passwordVersion isActive');
    if (!user || user.isActive === false) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    if (!await bcrypt.compare(parsed.data.currentPassword, user.password)) {
      return NextResponse.json({ ok: false, error: 'CURRENT_PASSWORD_INCORRECT' }, { status: 401 });
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.password)) {
      return NextResponse.json({ ok: false, error: 'PASSWORD_REUSED' }, { status: 400 });
    }
    const previousHash = user.password;
    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const update = await User.updateOne(
      { _id: user._id, password: previousHash, isActive: { $ne: false } },
      { $set: { password: newHash, passwordResetToken: null, passwordResetExpires: null }, $inc: { passwordVersion: 1 } },
      { runValidators: true },
    );
    if (update.modifiedCount !== 1) {
      return NextResponse.json({ ok: false, error: 'PASSWORD_CHANGED_CONCURRENTLY' }, { status: 409 });
    }
    await clearCustomerSession();
    await AuditEvent.create({
      actorType: 'customer', actorId: state.accountId, action: 'account.password_change',
      resourceType: 'user', resourceId: state.accountId, correlationId: request.headers.get('x-request-id'),
      outcome: 'success', metadata: { sessionsRevoked: true },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, sessionsRevoked: true, message: 'Password changed. Sign in again.' }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    logServerError({ route: 'POST /api/user/change-password', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'PASSWORD_CHANGE_FAILED' }, { status: 500 });
  }
}
