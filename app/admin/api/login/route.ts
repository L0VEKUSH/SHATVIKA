import { NextResponse } from 'next/server';
import { setAdminSession } from '@/lib/adminAuth';


export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '');
    const password = String(body?.password ?? '');

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, message: 'Admin credentials not configured' }, { status: 500 });
    }

    // Simple equality check (small system). For extra safety, you can use timingSafeEqual if desired.
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, message: 'Invalid credentials' }, { status: 401 });
    }

    await setAdminSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 });
  }
}

