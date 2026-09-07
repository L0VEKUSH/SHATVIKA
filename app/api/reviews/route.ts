import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { connectToMongo } from '@/lib/mongoose';
import { verifyAdminToken } from '@/lib/adminJwt';
import { verifyCustomerToken } from '@/lib/customerJwt';
import { Review } from '@/models/Review';
import { Order } from '@/models/Order';
import { User } from '@/models/User';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';


// NOTE: This project previously had no app/api routes.
// Public submission endpoints are implemented here.
// If Mongo fails, the API returns 503 so the client can fall back to localStorage.


const submitSchema = z.object({
  menuItemId: z.string().min(1).optional().nullable(),
  orderId: z.string().min(1).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(0).max(1000).optional().nullable(),
  imageUrl: z.string().optional().nullable().refine(
    v => !v || v.startsWith('/uploads/') || /^https?:\/\/.+/.test(v),
    { message: 'Invalid image URL' }
  ),
  website: z.string().optional(),
});

function getCustomerTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)customer_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getUserIdFromToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return typeof payload?.uid === 'string' ? payload.uid : null;
  } catch {
    return null;
  }
}

/**
 * Sanitize user-generated content using DOMPurify
 * Removes all HTML/JavaScript while preserving safe text
 */
function sanitizeContent(input: string): string {
  // DOMPurify removes all HTML tags by default
  // Returns plain text with dangerous content stripped
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}


export async function GET(req: NextRequest) {
  try {
    await connectToMongo();
  } catch (err) {
    console.error('[GET /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE', details: { cause: 'database_connection' } }, { status: 503 });
  }

  const url = new URL(req.url);
  const menuItemId = url.searchParams.get('menuItemId');
  const status = url.searchParams.get('status') ?? 'approved';
  const sort = url.searchParams.get('sort') ?? 'newest'; // newest, helpful, rating (high/low)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '12', 10)));

  const filter: Record<string, any> = { status };
  if (menuItemId === 'null') {
    filter.menuItemId = null;
  } else if (menuItemId) {
    filter.menuItemId = menuItemId;
  }

  let sortObj: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort === 'helpful') sortObj = { helpfulCount: -1, createdAt: -1 };
  if (sort === 'rating-high') sortObj = { rating: -1, createdAt: -1 };
  if (sort === 'rating-low') sortObj = { rating: 1, createdAt: -1 };

  try {
    const skip = (page - 1) * limit;
    const total = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate average rating and distribution
    const allReviews = await Review.find(filter).lean();
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length
      : 0;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allReviews.forEach((r: any) => {
      distribution[r.rating as keyof typeof distribution]++;
    });

    return NextResponse.json({
      ok: true,
      reviews: reviews.map((r: any) => ({
        id: r.id || r._id?.toString(),
        name: r.name,
        rating: r.rating,
        text: r.text ?? null,
        imageUrl: r.mediaUrls?.[0] ?? r.imageUrl ?? null,
        menuItemId: r.menuItemId ?? null,
        createdAt: r.createdAt,
        helpfulCount: r.helpfulCount ?? 0,
        verifiedPurchase: r.verifiedPurchase ?? false,
        replyText: r.replyText ?? null,
        replyDate: r.replyDate ?? null,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      avgRating: Math.round(avgRating * 10) / 10,
      distribution,
    });
  } catch (err) {
    console.error('[GET /api/reviews] Query error:', err);
    return NextResponse.json({ ok: false, error: 'QUERY_FAILED', details: { cause: 'database_query' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 5, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', details: { retryAfter: rateCheck.retryAfter } },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  const customerToken = getCustomerTokenFromCookies(req.headers.get('cookie'));
  if (!customerToken) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const isValidCustomer = await verifyCustomerToken(customerToken);
  if (!isValidCustomer) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const userId = getUserIdFromToken(customerToken);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

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

  if (parsed.data.website) {
    return NextResponse.json({ ok: false, error: 'SPAM' }, { status: 400 });
  }

  const { menuItemId, orderId, rating, text, imageUrl } = parsed.data;
  const sanitizedText = typeof text === 'string' ? sanitizeContent(text.trim()) : undefined;

  if (!menuItemId) {
    const t = sanitizedText ?? '';
    if (t.length < 10) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_SHORT', details: { min: 10 } }, { status: 400 });
    }
    if (t.length > 1000) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_LONG', details: { max: 1000 } }, { status: 400 });
    }
  } else {
    const t = sanitizedText ?? '';
    if (t.length > 500) {
      return NextResponse.json({ ok: false, error: 'TEXT_TOO_LONG', details: { max: 500 } }, { status: 400 });
    }
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[POST /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE', details: { cause: 'database_connection' } }, { status: 503 });
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const deliveredOrderFilter: Record<string, unknown> = {
    userId,
    orderStatus: 'delivered',
  };
  if (orderId) deliveredOrderFilter._id = orderId;
  if (menuItemId) deliveredOrderFilter['items.menuItemId'] = menuItemId;

  const verifiedOrder = await Order.findOne(deliveredOrderFilter).sort({ createdAt: -1 }).lean();
  if (!verifiedOrder) {
    return NextResponse.json(
      { ok: false, error: 'NOT_VERIFIED', message: 'Only customers with a delivered order can submit a review.' },
      { status: 403 }
    );
  }

  const duplicateFilter: Record<string, unknown> = {
    userId,
    menuItemId: menuItemId ?? null,
  };
  const existingReview = await Review.findOne(duplicateFilter).lean();
  if (existingReview) {
    return NextResponse.json({ ok: false, error: 'DUPLICATE_REVIEW' }, { status: 409 });
  }

  const review = await Review.create({
    name: user.fullName,
    rating,
    text: menuItemId ? sanitizedText ?? undefined : (sanitizedText ?? ''),
    imageUrl: imageUrl ?? undefined,
    mediaUrls: imageUrl ? [imageUrl] : [],
    email: user.email,
    userId,
    orderId: verifiedOrder._id,
    menuItemId: menuItemId ?? null,
    verifiedPurchase: true,
    status: 'pending',
  });

  return NextResponse.json({ ok: true, id: review._id.toString(), status: 'pending' });
}

function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertAdmin(cookieHeader: string | null) {
  // Middleware already protects /admin pages, but we still verify admin for API safety.
  // This route runs in Node so we use the Node-side verifier.
  const token = getTokenFromCookies(cookieHeader);
  if (!token) throw new Error('UNAUTHENTICATED');

  const ok = await verifyAdminToken(token);
  if (!ok) throw new Error('UNAUTHORIZED');
}


export async function PATCH(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED', details: { cause: 'auth_required' } }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });

  const patchSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['approved', 'rejected']).optional(),
    replyText: z.string().min(1).max(500).optional().nullable(),
  });

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, status, replyText } = parsed.data;

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[PATCH /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE', details: { cause: 'database_connection' } }, { status: 503 });
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (replyText !== undefined) {
    update.replyText = replyText ? sanitizeContent(replyText.trim()) : null;
    update.replyDate = replyText ? new Date() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  const updated = await Review.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND', details: { resource: 'review', id } }, { status: 404 });

  return NextResponse.json({
    ok: true,
    id,
    status: updated.status,
    replyText: updated.replyText ?? null,
    replyDate: updated.replyDate ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  try {
    await assertAdmin(cookieHeader);
  } catch {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED', details: { cause: 'auth_required' } }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'MISSING_ID', details: { param: 'id' } }, { status: 400 });

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[DELETE /api/reviews] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE', details: { cause: 'database_connection' } }, { status: 503 });
  }

  const deleted = await Review.findByIdAndDelete(id).lean();
  if (!deleted) return NextResponse.json({ ok: false, error: 'NOT_FOUND', details: { resource: 'review', id } }, { status: 404 });

  return NextResponse.json({ ok: true, id });
}

