import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

import { connectToMongo } from '@/lib/mongoose';
import { Admin } from '@/models/Admin';
import { setAdminSessionForAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function normalizeEmail(email: unknown) {
  return String(email ?? '').trim().toLowerCase();
}

function requireNonEmpty(value: unknown) {
  const s = String(value ?? '').trim();
  return s.length ? s : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = requireNonEmpty(body?.email);
    const password = requireNonEmpty(body?.password);

    if (!email || !password) {
      return NextResponse.json({ ok: false, message: 'email and password are required' }, { status: 400 });
    }

    // Keep signup protected: require ADMIN_SETUP_KEY.
    // (You can remove this later if you want fully open admin self-signup.)
    const setupKeyProvided = String(body?.setupKey ?? '');
    const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY ?? '';

    if (!ADMIN_SETUP_KEY) {
      return NextResponse.json({ ok: false, message: 'ADMIN_SETUP_KEY is not configured' }, { status: 500 });
    }

    if (!setupKeyProvided || setupKeyProvided !== ADMIN_SETUP_KEY) {
      return NextResponse.json({ ok: false, message: 'Invalid setup key' }, { status: 401 });
    }

    await connectToMongo();

    const normalized = normalizeEmail(email);

    const existing = await Admin.findOne({ email: normalized }).lean();
    if (existing) {
      return NextResponse.json({ ok: false, message: 'Email already exists' }, { status: 409 });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const created = await Admin.create({ email: normalized, password: passwordHash, passwordVersion: 0 });

    // Fetch the full admin document for fingerprint generation
    const adminDoc = await Admin.findById(created._id).lean();
    if (!adminDoc) {
      return NextResponse.json({ ok: false, message: 'Failed to retrieve created admin' }, { status: 500 });
    }

    await setAdminSessionForAdmin(String(created._id), adminDoc);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /admin/api/signup]', err);
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 });
  }
}


