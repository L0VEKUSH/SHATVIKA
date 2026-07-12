import { NextResponse } from 'next/server';

import { setAdminSession } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

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

    // DB-less admin signup.
    // This codebase currently does NOT persist new admin credentials to a DB.
    // Instead, it issues the admin JWT cookie only if a one-time setup key is provided.
    // This avoids depending on MongoDB while keeping the app deployable.
    const setupKeyProvided = String(body?.setupKey ?? '');
    const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY ?? '';

    if (!ADMIN_SETUP_KEY) {
      return NextResponse.json({ ok: false, message: 'ADMIN_SETUP_KEY is not configured' }, { status: 500 });
    }

    if (!setupKeyProvided || setupKeyProvided !== ADMIN_SETUP_KEY) {
      return NextResponse.json({ ok: false, message: 'Invalid setup key' }, { status: 401 });
    }

    // Create admin session cookie.
    // NOTE: Existing JWT verification also checks a fingerprint derived from env ADMIN_EMAIL/ADMIN_PASSWORD.
    // So if those env vars are not set, the issued token won't authenticate.
    // To keep signup "without DB" functional, we mint a session only when those env vars already exist.
    // If you want truly env-less signup, we must also adjust adminJwt.ts verification logic.
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Admin login is env-based. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local (signup UI is DB-less only).',
        },
        { status: 500 }
      );
    }

    // If you reach here, we treat signup request as setting up the session (not persisting credentials).
    await setAdminSession();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /admin/api/signup]', err);
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 });
  }
}

