import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { User } from '@/models/User';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';
import { validatePassword } from '@/lib/validators';

export async function POST(req: Request) {
  try {
    const isAuthed = await isCustomerAuthed();
    if (!isAuthed) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = await getCustomerId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = body;

    // Validate inputs
    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Current password is required' },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'New password is required' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: 'New passwords do not match' },
        { status: 400 }
      );
    }

    // Validate new password strength
    const passwordVal = validatePassword(newPassword);
    if (!passwordVal.valid) {
      return NextResponse.json(
        { ok: false, error: 'New password does not meet requirements', details: passwordVal.errors },
        { status: 400 }
      );
    }

    // Check if current password is the same as new password
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { ok: false, error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    await connectToMongo();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { ok: false, error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and increment passwordVersion to invalidate old tokens
    user.password = hashedPassword;
    user.passwordVersion = (user.passwordVersion || 0) + 1;

    await user.save();

    return NextResponse.json({ ok: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('[ChangePassword] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
