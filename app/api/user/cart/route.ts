import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError, publicApiErrorMessage } from '@/lib/apiError';
import { BusinessRulesConfigurationError } from '@/lib/businessRules';
import { getCustomerSessionState } from '@/lib/customerJwt';
import { enforceCustomerMutationRateLimit } from '@/lib/customerRouteAuth';
import { CartQuoteError, quoteCustomerCart } from '@/lib/orders/cartQuote';
import { User } from '@/models/User';

export const dynamic = 'force-dynamic';

const lineSchema = z.object({
  menuItemId: z.string().trim().min(1).max(64),
  variantId: z.string().trim().min(1).max(120).optional(),
  quantity: z.number().int().min(1).max(100),
}).strict();
const syncSchema = z.object({
  items: z.array(lineSchema).max(100),
  couponCode: z.string().trim().min(1).max(50).nullable().optional(),
}).strict();

async function customer() {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return { error: NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    ) } as const;
  }
  return { state } as const;
}

function quoteFailure(error: unknown, request: NextRequest) {
  if (error instanceof CartQuoteError) {
    return NextResponse.json({
      ok: false,
      error: error.code,
      message: publicApiErrorMessage(error.code, error.details),
      details: error.details,
    }, { status: error.status });
  }
  if (error instanceof BusinessRulesConfigurationError) {
    return NextResponse.json({ ok: false, error: 'CHECKOUT_NOT_CONFIGURED', details: { missing: error.missing } }, { status: 503 });
  }
  logServerError({ route: '/api/user/cart', err: error, requestId: request.headers.get('x-request-id') });
  return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const auth = await customer();
  if ('error' in auth) return auth.error;
  try {
    const user = await User.findById(auth.state.accountId).select('cart').lean();
    if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const items = (user.cart?.items ?? []).map((item: any) => ({
      menuItemId: String(item.menuItemId), variantId: String(item.variantId || 'base'), quantity: Number(item.quantity),
    }));
    const quote = await quoteCustomerCart({
      userId: auth.state.accountId,
      lines: items,
      couponCode: user.cart?.couponCode,
    });
    return NextResponse.json({ ok: true, cart: { items: quote.items, couponCode: quote.couponCode }, totals: quote }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return quoteFailure(error, request);
  }
}

export async function POST(request: NextRequest) {
  const auth = await customer();
  if ('error' in auth) return auth.error;
  const limited = await enforceCustomerMutationRateLimit({
    accountId: auth.state.accountId,
    scope: 'cart-sync',
    limit: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;
  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const quote = await quoteCustomerCart({
      userId: auth.state.accountId,
      lines: parsed.data.items,
      couponCode: parsed.data.couponCode,
    });
    const update = await User.updateOne({ _id: auth.state.accountId, isActive: { $ne: false } }, {
      $set: {
        'cart.items': quote.items,
        'cart.couponCode': quote.couponCode,
        'cart.lastUpdated': new Date(),
      },
    });
    if (update.matchedCount !== 1) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    return NextResponse.json({ ok: true, cart: { items: quote.items, couponCode: quote.couponCode }, totals: quote }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return quoteFailure(error, request);
  }
}
