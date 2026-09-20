import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { logServerError } from '@/lib/apiError';
import { distributedRateLimit } from '@/lib/rateLimit';
import { Review } from '@/models/Review';

const schema = z.object({ helpful: z.boolean() }).strict();

function voterKey(accountId: string) {
  const secret = process.env.CUSTOMER_JWT_SECRET ?? '';
  return `v1:${crypto.createHmac('sha256', secret).update(`review-voter:${accountId}`).digest('hex')}`;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_REVIEW_ID' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const limited = await distributedRateLimit(`review-helpful:${state.accountId}`, 30, 60);
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } },
      );
    }
    const key = voterKey(state.accountId);
    const desiredVoters = parsed.data.helpful
      ? { $setUnion: [{ $ifNull: ['$helpfulVoters', []] }, [key]] }
      : { $setDifference: [{ $ifNull: ['$helpfulVoters', []] }, [key]] };
    const updated = await Review.findOneAndUpdate(
      { _id: id, status: 'approved' },
      [
        { $set: { helpfulVoters: desiredVoters } },
        { $set: { helpfulCount: { $size: '$helpfulVoters' } } },
      ],
      { returnDocument: 'after', updatePipeline: true },
    ).select('helpfulCount helpfulVoters').lean();
    if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      id,
      helpful: updated.helpfulVoters?.includes(key) ?? false,
      helpfulCount: Number(updated.helpfulCount ?? 0),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'PUT /api/reviews/:id/helpful', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REVIEW_UPDATE_FAILED' }, { status: 500 });
  }
}
