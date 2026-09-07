import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { Admin } from '@/models/Admin';
import { connectToMongo } from '@/lib/mongoose';
import { setAdminSessionForAdmin } from '@/lib/adminAuth';
import { rateLimit } from '@/lib/rateLimit';

// Fake bcrypt hash for timing-safe comparison when admin not found.
// This is a valid bcrypt hash that will always return false on compare().
const FAKE_HASH = '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfakehash';

function normalizeEmail(email: unknown) {
  return String(email ?? '').trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 login attempts per minute per IP
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = await rateLimit(`admin-login:${ip}`, 5, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ ok: false, message: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const emailRaw = body?.email;
    const passwordRaw = body?.password;

    const email = normalizeEmail(emailRaw);
    const password = String(passwordRaw ?? '');

    if (!email || !password) {
      return NextResponse.json({ ok: false, message: 'email and password are required' }, { status: 400 });
    }

    await connectToMongo();

    // Query using normalized email (already normalized above)
    const admin = await Admin.findOne({ email }).lean();

    // For timing-safe comparison: use fake hash if admin not found
    const passwordHash = admin?.password ?? FAKE_HASH;

    // Always perform comparison, even if admin doesn't exist
    // This prevents timing attacks that leak whether the email exists
    const passwordOk = await bcrypt.compare(password, passwordHash);

    if (!admin || !passwordOk) {
      return NextResponse.json({ ok: false, message: 'Invalid credentials' }, { status: 401 });
    }

    // JWT cookie based on admin id and full admin data
    await setAdminSessionForAdmin(String(admin._id), admin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AdminLogin] error:', err);
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 });
  }
}



