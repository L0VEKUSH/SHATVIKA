import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import { Review } from '@/models/Review';
import { verifyCustomerToken } from '@/lib/customerJwt';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const schema = z.object({
  helpful: z.boolean(),
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

function voterKey(req: NextRequest, userId: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 20, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', details: { retryAfter: rateCheck.retryAfter } },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[PUT /api/reviews/:id/helpful] DB connection failed:', err);
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  const cookieHeader = req.headers.get('cookie');
  const customerToken = getCustomerTokenFromCookies(cookieHeader);
  let userId: string | null = null;
  if (customerToken && await verifyCustomerToken(customerToken)) {
    userId = getUserIdFromToken(customerToken);
  }

  const key = voterKey(req, userId);

  try {
    const review = await Review.findById(id);
    if (!review) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    const voters: string[] = review.helpfulVoters ?? [];
    const hasVoted = voters.includes(key);
    const wantHelpful = parsed.data.helpful;

    if (wantHelpful && hasVoted) {
      return NextResponse.json({
        ok: true,
        id,
        helpfulCount: review.helpfulCount ?? 0,
        alreadyVoted: true,
      });
    }

    if (!wantHelpful && !hasVoted) {
      return NextResponse.json({
        ok: true,
        id,
        helpfulCount: review.helpfulCount ?? 0,
      });
    }

    if (wantHelpful) {
      review.helpfulCount = Math.max(0, (review.helpfulCount ?? 0) + 1);
      review.helpfulVoters = [...voters, key];
    } else {
      review.helpfulCount = Math.max(0, (review.helpfulCount ?? 0) - 1);
      review.helpfulVoters = voters.filter(v => v !== key);
    }

    await review.save();

    return NextResponse.json({
      ok: true,
      id,
      helpfulCount: review.helpfulCount ?? 0,
    });
  } catch (err) {
    console.error('[PUT /api/reviews/:id/helpful] Error:', err);
    return NextResponse.json({ ok: false, error: 'UPDATE_FAILED' }, { status: 500 });
  }
}
