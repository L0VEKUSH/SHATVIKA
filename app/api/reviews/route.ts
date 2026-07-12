import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import { verifyAdminToken } from '@/lib/adminJwt';
import { Review } from '@/models/Review';


// NOTE: This project previously had no app/api routes.
// Public submission endpoints are implemented here.
// If Mongo fails, the API returns 503 so the client can fall back to localStorage.


const submitSchema = z.object({
  menuItemId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(0).max(1000).optional().nullable(),
  email: z.string().email().optional().nullable(),
  // imageUrl is set by upload endpoint on the client/admin
  imageUrl: z.string().url().optional().nullable(),
  // honeypot
  website: z.string().optional(),
});

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}


export async function GET(req: Request) {
  try {
    await connectToMongo();
  } catch (err) {
    console.error('[GET /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }


  const url = new URL(req.url);
  const menuItemId = url.searchParams.get('menuItemId');
  const status = url.searchParams.get('status') ?? 'approved';

  const filter: Record<string, any> = { status };
  if (menuItemId && menuItemId !== 'null') filter.menuItemId = menuItemId;
  if (!menuItemId || menuItemId === 'null') filter.menuItemId = null;

  const reviews = await Review.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    ok: true,
    reviews: reviews.map((r: any) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      text: r.text ?? null,
      imageUrl: r.imageUrl ?? null,
      menuItemId: r.menuItemId ?? null,
      createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  // Public submission endpoint.
  // Admin moderation uses separate endpoints later.

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }

  // Honeypot
  if ((parsed.data as any).website) {
    return NextResponse.json({ ok: false, error: 'SPAM' }, { status: 400 });
  }

  const { menuItemId, name, rating, text, email, imageUrl } = parsed.data;

  const sanitizedName = escapeHtml(name.trim());
  const sanitizedText = typeof text === 'string' ? escapeHtml(text.trim()) : undefined;

  // text validation rule: overall requires 10-1000; quick item ratings allow empty/short
  if (!menuItemId) {
    const t = sanitizedText ?? '';
    if (t.length < 10) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_SHORT' }, { status: 400 });
    }
    if (t.length > 1000) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_LONG' }, { status: 400 });
    }
  }

  // item rating text optional but if provided, keep it small
  if (menuItemId) {
    const t = sanitizedText ?? '';
    if (t.length > 500) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_LONG' }, { status: 400 });
    }
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[POST /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }


  const review = await Review.create({
    name: sanitizedName,
    rating,
    text: menuItemId ? sanitizedText ?? undefined : (sanitizedText ?? ''),
    imageUrl: imageUrl ?? undefined,
    email: email ?? undefined,
    menuItemId: menuItemId ?? null,
    status: 'pending',
  });

  return NextResponse.json({ ok: true, id: review._id.toString(), status: 'pending' });
}

function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function assertAdmin(cookieHeader: string | null) {
  // Middleware already protects /admin pages, but we still verify admin for API safety.
  // This route runs in Node so we use the Node-side verifier.
  const token = getTokenFromCookies(cookieHeader);
  if (!token) throw new Error('UNAUTHENTICATED');

  const ok = verifyAdminToken(token);
  if (!ok) throw new Error('UNAUTHORIZED');
}


export async function PATCH(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });

  const patchSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['approved', 'rejected']),
  });

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, status } = parsed.data;

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[PATCH /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }


  const updated = await Review.findByIdAndUpdate(id, { status }, { new: true }).lean();
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ ok: true, id, status });
}

export async function DELETE(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'MISSING_ID' }, { status: 400 });

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[DELETE /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }


  const deleted = await Review.findByIdAndDelete(id).lean();
  if (!deleted) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ ok: true, id });
}


