import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { User } from '@/models/User';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';
import { validateFullName, validatePhone } from '@/lib/validators';

export async function GET() {
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

    await connectToMongo();

    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || null,
      profilePhoto: user.profilePhoto || null,
      addresses: user.addresses || [],
      joinedDate: user.joinedDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return NextResponse.json({ ok: true, user: userData });
  } catch (err) {
    console.error('[UserProfile GET] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
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

    const { fullName, phone, profilePhoto } = body;
    const updates: Record<string, any> = {};

    // Validate and add fullName if provided
    if (fullName !== undefined) {
      const validation = validateFullName(fullName);
      if (!validation.valid) {
        return NextResponse.json(
          { ok: false, error: validation.error },
          { status: 400 }
        );
      }
      updates.fullName = fullName.trim();
    }

    // Validate and add phone if provided
    if (phone !== undefined) {
      const validation = validatePhone(phone);
      if (!validation.valid) {
        return NextResponse.json(
          { ok: false, error: validation.error },
          { status: 400 }
        );
      }
      updates.phone = phone.replace(/\D/g, '');
    }

    // Add profilePhoto if provided (URL validation is minimal)
    if (profilePhoto !== undefined && typeof profilePhoto === 'string') {
      updates.profilePhoto = profilePhoto;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No fields to update' },
        { status: 400 }
      );
    }

    await connectToMongo();

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).lean();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || null,
      profilePhoto: user.profilePhoto || null,
      addresses: user.addresses || [],
      joinedDate: user.joinedDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return NextResponse.json({ ok: true, user: userData });
  } catch (err) {
    console.error('[UserProfile PUT] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
