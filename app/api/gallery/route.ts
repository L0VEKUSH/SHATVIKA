import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import { verifyAdminToken } from '@/lib/adminJwt';
import { GalleryItem } from '@/models/Content';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/* ── Schemas ────────────────────────────────────── */
const mediaUrlSchema = z.string().min(1).refine(
  (url) => url.startsWith('/uploads/') || /^https?:\/\/.+/.test(url),
  { message: 'Must be a valid URL or /uploads/ path' }
);

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(['Food', 'Restaurant', 'Team', 'Events']),
  imageUrl: mediaUrlSchema,
  imageType: z.enum(['image', 'video', 'youtube']).default('image'),
  youtubeId: z.string().optional(),
  featured: z.boolean().default(false),
  order: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    order: z.number().int(),
  })),
});

/* ── Helpers ────────────────────────────────────── */
function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertAdmin(cookieHeader: string | null) {
  const token = getTokenFromCookies(cookieHeader);
  if (!token) throw new Error('UNAUTHENTICATED');

  const ok = await verifyAdminToken(token);
  if (!ok) throw new Error('UNAUTHORIZED');
}

/* ── GET: Fetch gallery items ─────────────────── */
export async function GET(req: NextRequest) {
  // Rate limiting: 30 requests per minute per IP
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 30, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[GET /api/gallery] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const featured = url.searchParams.get('featured');
  const sort = url.searchParams.get('sort') ?? 'order'; // order|newest
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10)));

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (featured === 'true') filter.featured = true;
  else if (featured === 'false') filter.featured = false;

  let sortObj: Record<string, 1 | -1> = { featured: -1, order: 1 };
  if (sort === 'newest') sortObj = { createdAt: -1 };

  try {
    const items = await GalleryItem.find(filter)
      .sort(sortObj)
      .limit(limit)
      .lean();

    const total = await GalleryItem.countDocuments(filter);

    return NextResponse.json({
      ok: true,
      items: items.map((item: { id?: string; _id?: { toString(): string }; title: string; description?: string; category: string; imageUrl: string; imageType: string; youtubeId?: string; featured: boolean; order: number; createdAt: Date }) => ({
        id: item.id || item._id?.toString(),
        title: item.title,
        description: item.description,
        category: item.category,
        imageUrl: item.imageUrl,
        imageType: item.imageType,
        youtubeId: item.youtubeId,
        featured: item.featured,
        order: item.order,
        createdAt: item.createdAt,
      })),
      total,
    });
  } catch (err) {
    console.error('[GET /api/gallery] Query error:', err);
    return NextResponse.json({ ok: false, error: 'QUERY_FAILED' }, { status: 500 });
  }
}

/* ── POST: Create gallery item ─────────────────– */
export async function POST(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[POST /api/gallery] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  const { title, description, category, imageUrl, imageType, youtubeId, featured, order } = parsed.data;

  try {
    // Auto-set order to highest+1 if not provided
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxOrder = await GalleryItem.findOne().sort({ order: -1 }).lean();
      finalOrder = (maxOrder?.order ?? 0) + 1;
    }

    const newItem = await GalleryItem.create({
      title,
      description: description || '',
      category,
      imageUrl,
      imageType,
      youtubeId: youtubeId || null,
      featured: featured || false,
      order: finalOrder,
    });

    return NextResponse.json(
      {
        ok: true,
        id: newItem._id.toString(),
        item: {
          id: newItem._id.toString(),
          title: newItem.title,
          description: newItem.description,
          category: newItem.category,
          imageUrl: newItem.imageUrl,
          imageType: newItem.imageType,
          youtubeId: newItem.youtubeId,
          featured: newItem.featured,
          order: newItem.order,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/gallery] Create error:', err);
    return NextResponse.json({ ok: false, error: 'CREATE_FAILED' }, { status: 500 });
  }
}

/* ── PUT: Update gallery item ──────────────────– */
export async function PUT(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ ok: false, error: 'MISSING_ID' }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[PUT /api/gallery] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const updated = await GalleryItem.findByIdAndUpdate(id, { $set: parsed.data }, { new: true }).lean();
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      id,
      item: {
        id: updated.id || updated._id?.toString(),
        title: updated.title,
        description: updated.description,
        category: updated.category,
        imageUrl: updated.imageUrl,
        imageType: updated.imageType,
        youtubeId: updated.youtubeId,
        featured: updated.featured,
        order: updated.order,
      },
    });
  } catch (err) {
    console.error('[PUT /api/gallery] Update error:', err);
    return NextResponse.json({ ok: false, error: 'UPDATE_FAILED' }, { status: 500 });
  }
}

/* ── DELETE: Delete gallery item ────────────────– */
export async function DELETE(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ ok: false, error: 'MISSING_ID' }, { status: 400 });
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[DELETE /api/gallery] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const deleted = await GalleryItem.findByIdAndDelete(id).lean();
    if (!deleted) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error('[DELETE /api/gallery] Delete error:', err);
    return NextResponse.json({ ok: false, error: 'DELETE_FAILED' }, { status: 500 });
  }
}

/* ── PATCH: Reorder gallery items ──────────────– */
export async function PATCH(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = reorderSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[PATCH /api/gallery] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const { items } = parsed.data;
    const updated = [];

    for (const item of items) {
      const result = await GalleryItem.findByIdAndUpdate(
        item.id,
        { $set: { order: item.order } },
        { new: true }
      ).lean();

      if (result) {
        updated.push({
          id: result.id || result._id?.toString(),
          order: result.order,
        });
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error('[PATCH /api/gallery] Reorder error:', err);
    return NextResponse.json({ ok: false, error: 'REORDER_FAILED' }, { status: 500 });
  }
}
