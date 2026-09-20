import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError } from '@/lib/apiError';
import { BusinessRulesConfigurationError } from '@/lib/businessRules';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { CartQuoteError, quoteCustomerCart } from '@/lib/orders/cartQuote';
import { distributedRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().trim().min(1).max(50),
  items: z.array(z.object({
    menuItemId: z.string().trim().min(1).max(64),
    variantId: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(100),
  }).strict()).min(1).max(100),
}).strict();

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: NextRequest) {
  const customer = await getCustomerSessionState();
  if (customer.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: customer.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: customer.status === 'database_unavailable' ? 503 : 401, headers: PRIVATE_HEADERS },
    );
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const limit = await distributedRateLimit(`coupon-validate:${customer.accountId}`, 20, 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limit.retryAfter },
        {
          status: 429,
          headers: { ...PRIVATE_HEADERS, 'Retry-After': String(limit.retryAfter ?? 60) },
        },
      );
    }
    const quote = await quoteCustomerCart({
      userId: customer.accountId,
      lines: parsed.data.items,
      couponCode: parsed.data.code,
    });
    if (!quote.coupon) throw new CartQuoteError('COUPON_NOT_FOUND', 404);
    return NextResponse.json({
      ok: true,
      coupon: quote.coupon,
      subtotalPaise: quote.subtotalPaise,
      discountPaise: quote.discountPaise,
      calculatedDiscount: quote.discount,
      provisional: true,
      message: 'Final eligibility and amount are revalidated atomically at checkout.',
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof CartQuoteError) {
      return NextResponse.json(
        { ok: false, error: error.code, details: error.details },
        { status: error.status, headers: PRIVATE_HEADERS },
      );
    }
    if (error instanceof BusinessRulesConfigurationError) {
      return NextResponse.json(
        { ok: false, error: 'CHECKOUT_NOT_CONFIGURED', details: { missing: error.missing } },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    }
    logServerError({ route: 'POST /api/coupons/validate', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'COUPON_VALIDATION_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
