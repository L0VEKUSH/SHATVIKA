import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { ADMIN_COOKIE_NAME, verifyAdminTokenState, type AdminSessionState } from '@/lib/adminJwt';
import { CUSTOMER_COOKIE_NAME, verifyCustomerTokenState, type CustomerSessionState } from '@/lib/customerJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { reviewOrderEligibilityFilter } from '@/lib/reviews/eligibility';
import { AuditEvent } from '@/models/AuditEvent';
import { Order } from '@/models/Order';
import { Review } from '@/models/Review';
import { User } from '@/models/User';
import { MediaAsset } from '@/models/MediaAsset';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const mediaUrlSchema = z.string().max(2048).refine(value => {
  if (/^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Media must be a durable HTTPS URL');
const submitSchema = z.object({
  menuItemId: objectIdSchema.optional().nullable(),
  orderId: objectIdSchema.optional().nullable(),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional().nullable(),
  imageUrl: mediaUrlSchema.optional().nullable(),
  mediaAssetId: objectIdSchema.optional().nullable(),
  website: z.string().max(200).optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.imageUrl) !== Boolean(value.mediaAssetId)) {
    context.addIssue({ code: 'custom', path: ['mediaAssetId'], message: 'Uploaded media URL and asset ID are required together' });
  }
});
const moderationSchema = z.object({
  id: objectIdSchema,
  status: z.enum(['approved', 'rejected']).optional(),
  replyText: z.string().trim().min(1).max(500).optional().nullable(),
}).strict();

type ValidAdmin = Extract<AdminSessionState, { status: 'valid' }>;

async function customerSession(request: NextRequest): Promise<CustomerSessionState> {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  return token ? verifyCustomerTokenState(token) : { status: 'invalid' };
}

async function adminSession(request: NextRequest): Promise<AdminSessionState> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return token ? verifyAdminTokenState(token) : { status: 'invalid' };
}

function canModerate(admin: ValidAdmin) {
  return admin.permissions.includes('*') || admin.permissions.includes('reviews:moderate');
}

function sanitizeText(value: string) {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

function reviewResponse(row: any, includePrivate: boolean) {
  return {
    id: String(row._id),
    name: row.isAnonymous && !includePrivate ? 'Anonymous' : row.name,
    rating: Number(row.rating),
    text: row.text ?? null,
    imageUrl: row.mediaUrls?.[0] ?? row.imageUrl ?? null,
    menuItemId: row.menuItemId ? String(row.menuItemId) : null,
    orderId: includePrivate && row.orderId ? String(row.orderId) : undefined,
    userId: includePrivate && row.userId ? String(row.userId) : undefined,
    email: includePrivate ? row.email ?? null : undefined,
    status: includePrivate ? row.status : undefined,
    createdAt: row.createdAt,
    helpfulCount: Number(row.helpfulCount ?? 0),
    verifiedPurchase: Boolean(row.verifiedPurchase),
    replyText: row.replyText ?? null,
    replyDate: row.replyDate ?? null,
  };
}

export async function GET(request: NextRequest) {
  const adminRequested = request.nextUrl.searchParams.get('scope') === 'admin';
  let admin: ValidAdmin | null = null;
  if (adminRequested) {
    const state = await adminSession(request);
    if (state.status === 'database_unavailable') return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
    if (state.status !== 'valid' || !canModerate(state)) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
    admin = state;
  }

  try {
    await connectToMongo();
    const pageValue = Number(request.nextUrl.searchParams.get('page') ?? 1);
    const limitValue = Number(request.nextUrl.searchParams.get('limit') ?? 12);
    const page = Number.isInteger(pageValue) ? Math.max(1, pageValue) : 1;
    const limit = Number.isInteger(limitValue) ? Math.min(100, Math.max(1, limitValue)) : 12;
    const menuItemId = request.nextUrl.searchParams.get('menuItemId');
    if (menuItemId && menuItemId !== 'null' && !mongoose.isValidObjectId(menuItemId)) {
      return NextResponse.json({ ok: false, error: 'INVALID_MENU_ITEM_ID' }, { status: 400 });
    }
    const requestedStatus = request.nextUrl.searchParams.get('status') ?? (admin ? 'all' : 'approved');
    if (admin && !['all', 'pending', 'approved', 'rejected'].includes(requestedStatus)) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const filter: Record<string, unknown> = {};
    filter.status = admin && requestedStatus === 'all' ? { $in: ['pending', 'approved', 'rejected'] } : admin ? requestedStatus : 'approved';
    if (menuItemId === 'null') filter.menuItemId = null;
    else if (menuItemId) filter.menuItemId = new mongoose.Types.ObjectId(menuItemId);
    const sortName = request.nextUrl.searchParams.get('sort') ?? 'newest';
    const sort: Record<string, 1 | -1> = sortName === 'helpful' ? { helpfulCount: -1, createdAt: -1 }
      : sortName === 'rating-high' ? { rating: -1, createdAt: -1 }
        : sortName === 'rating-low' ? { rating: 1, createdAt: -1 }
          : { createdAt: -1 };
    const [total, reviews, summary] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Review.aggregate<{ _id: null; average: number; distribution: Array<{ rating: number; count: number }> }>([
        { $match: filter },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $group: { _id: null, average: { $sum: { $multiply: ['$_id', '$count'] } }, total: { $sum: '$count' }, distribution: { $push: { rating: '$_id', count: '$count' } } } },
        { $project: { average: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$average', '$total'] }, 0] }, distribution: 1 } },
      ]),
    ]);
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const entry of summary[0]?.distribution ?? []) {
      if (entry.rating >= 1 && entry.rating <= 5) distribution[entry.rating as 1 | 2 | 3 | 4 | 5] = entry.count;
    }
    return NextResponse.json({
      ok: true,
      reviews: reviews.map(row => reviewResponse(row, Boolean(admin))),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      avgRating: Math.round(Number(summary[0]?.average ?? 0) * 10) / 10,
      distribution,
    }, { headers: admin ? PRIVATE_HEADERS : { 'Cache-Control': 'public, max-age=30' } });
  } catch (error) {
    logServerError({ route: 'GET /api/reviews', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REVIEWS_UNAVAILABLE' }, { status: 503, headers: admin ? PRIVATE_HEADERS : undefined });
  }
}

export async function POST(request: NextRequest) {
  const state = await customerSession(request);
  if (state.status === 'database_unavailable') return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  if (state.status !== 'valid') return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const limited = await distributedRateLimit(`review-submit:${state.accountId}:${getClientIp(request)}`, 5, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } });
    const parsed = submitSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.website) return NextResponse.json({ ok: false, error: 'SPAM' }, { status: 400 });
    const text = sanitizeText(parsed.data.text ?? '');
    if (!parsed.data.menuItemId && text.length < 10) return NextResponse.json({ ok: false, error: 'TEXT_TOO_SHORT', details: { min: 10 } }, { status: 400 });
    if (parsed.data.menuItemId && text.length > 500) return NextResponse.json({ ok: false, error: 'TEXT_TOO_LONG', details: { max: 500 } }, { status: 400 });
    const user = await User.findById(state.accountId).select('fullName email isActive').lean();
    if (!user || user.isActive === false) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const session = await mongoose.startSession();
    let review: any;
    try {
      await session.withTransaction(async () => {
        const orderFilter = reviewOrderEligibilityFilter({
          userId: state.accountId,
          orderId: parsed.data.orderId,
          menuItemId: parsed.data.menuItemId,
        });
        const verifiedOrder = await Order.findOne(orderFilter).sort({ createdAt: -1 }).select('_id').session(session).lean();
        if (!verifiedOrder) throw new ReviewSubmissionError('NOT_VERIFIED', 403);
        const existing = await Review.exists({ userId: state.accountId, menuItemId: parsed.data.menuItemId ?? null }).session(session);
        if (existing) throw new ReviewSubmissionError('DUPLICATE_REVIEW', 409);
        const reviewId = new mongoose.Types.ObjectId();
        if (parsed.data.mediaAssetId && parsed.data.imageUrl) {
          const claimed = await MediaAsset.findOneAndUpdate({
            _id: parsed.data.mediaAssetId,
            ownerType: 'customer',
            ownerId: state.accountId,
            scope: 'review',
            status: 'active',
            linkedResourceId: null,
            url: parsed.data.imageUrl,
          }, {
            $set: { linkedResourceType: 'review', linkedResourceId: String(reviewId) },
          }, { returnDocument: 'after', session }).lean();
          if (!claimed) throw new ReviewSubmissionError('MEDIA_ASSET_NOT_AVAILABLE', 409);
        }
        [review] = await Review.create([{
          _id: reviewId,
          name: user.fullName,
          email: user.email,
          rating: parsed.data.rating,
          text: text || undefined,
          imageUrl: parsed.data.imageUrl ?? undefined,
          mediaUrls: parsed.data.imageUrl ? [parsed.data.imageUrl] : [],
          mediaAssetId: parsed.data.mediaAssetId ?? null,
          userId: state.accountId,
          orderId: verifiedOrder._id,
          menuItemId: parsed.data.menuItemId ?? null,
          verifiedPurchase: true,
          status: 'pending',
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    if (!review) throw new Error('REVIEW_TRANSACTION_FAILED');
    await AuditEvent.create({
      actorType: 'customer', actorId: state.accountId, action: 'review.submit',
      resourceType: 'review', resourceId: String(review._id), correlationId: request.headers.get('x-request-id'),
      outcome: 'success', metadata: { rating: parsed.data.rating, scope: parsed.data.menuItemId ? 'product' : 'overall' },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, id: String(review._id), status: 'pending' }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewSubmissionError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'DUPLICATE_REVIEW' }, { status: 409 });
    }
    if (/Transaction numbers are only allowed|replica set|Transaction support/i.test(error instanceof Error ? error.message : '')) {
      return NextResponse.json({ ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' }, { status: 503 });
    }
    logServerError({ route: 'POST /api/reviews', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REVIEW_SUBMISSION_FAILED' }, { status: 500 });
  }
}

class ReviewSubmissionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'ReviewSubmissionError';
  }
}

export async function PATCH(request: NextRequest) {
  const state = await adminSession(request);
  if (state.status === 'database_unavailable') return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  if (state.status !== 'valid' || !canModerate(state)) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  const parsed = moderationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400, headers: PRIVATE_HEADERS });
  const update: Record<string, unknown> = {};
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.replyText !== undefined) {
    update.replyText = parsed.data.replyText ? sanitizeText(parsed.data.replyText) : null;
    update.replyDate = parsed.data.replyText ? new Date() : null;
    update.replyBy = parsed.data.replyText ? state.accountId : null;
  }
  if (!Object.keys(update).length) return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const updated = await Review.findByIdAndUpdate(parsed.data.id, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
    if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers: PRIVATE_HEADERS });
    await AuditEvent.create({ actorType: 'admin', actorId: state.accountId, action: 'review.moderate', resourceType: 'review', resourceId: parsed.data.id, correlationId: request.headers.get('x-request-id'), outcome: 'success', metadata: { status: parsed.data.status ?? 'reply_updated' } }).catch(() => undefined);
    return NextResponse.json({ ok: true, review: reviewResponse(updated, true) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    logServerError({ route: 'PATCH /api/reviews', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REVIEW_UPDATE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  const state = await adminSession(request);
  if (state.status === 'database_unavailable') return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  if (state.status !== 'valid' || !canModerate(state)) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_REVIEW_ID' }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const deleted = await Review.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers: PRIVATE_HEADERS });
    await AuditEvent.create({ actorType: 'admin', actorId: state.accountId, action: 'review.delete', resourceType: 'review', resourceId: id, correlationId: request.headers.get('x-request-id'), outcome: 'success', metadata: {} }).catch(() => undefined);
    return NextResponse.json({ ok: true, id }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    logServerError({ route: 'DELETE /api/reviews', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REVIEW_DELETE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
