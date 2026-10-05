import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError, publicApiErrorMessage } from '@/lib/apiError';
import { distributedRateLimit } from '@/lib/rateLimit';
import { BusinessRulesConfigurationError } from '@/lib/businessRules';
import { createCustomerOrder, OrderServiceError } from '@/lib/orders/service';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';
import { applyGuestSessionCookie, getGuestSessionFromRequest } from '@/lib/guestSession';
import {
  OrderPrincipalError,
  orderOwnershipFilter,
  resolveOrderPrincipal,
  type OrderPrincipal,
} from '@/lib/orderPrincipal';
import { Order } from '@/models/Order';

export const dynamic = 'force-dynamic';

const CREATE_ORDER_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Shatvika-Operation': 'counter-order',
};

function createOrderResponse(
  body: Record<string, unknown>,
  status: number,
  headers?: HeadersInit,
  principal?: OrderPrincipal | null,
) {
  const response = NextResponse.json(body, {
    status,
    headers: { ...CREATE_ORDER_HEADERS, ...headers },
  });
  if (principal?.kind === 'guest') applyGuestSessionCookie(response, principal.issuedSession);
  return response;
}

const createOrderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    variantId: z.string().max(120).optional(),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(100),
  fulfillmentType: z.literal('counter').default('counter'),
  paymentMethod: z.literal('counter').default('counter'),
  couponCode: z.string().trim().min(1).max(50).optional(),
  specialInstructions: z.string().trim().max(500).optional(),
  customerName: z.string().trim().min(1).max(80).optional(),
}).strict();

function publicOrder(order: any) {
  return {
    id: String(order._id),
    orderNumber: order.tokenNumber ?? String(order._id).slice(-8),
    tokenNumber: order.tokenNumber ?? null,
    tokenBusinessDate: order.tokenBusinessDate ?? null,
    fulfillmentType: order.fulfillmentType ?? 'delivery',
    fulfillmentLocationId: order.fulfillmentLocationId ?? null,
    fulfillmentLocationName: order.fulfillmentLocationName ?? null,
    items: (order.items ?? []).map((item: any) => ({
      menuItemId: String(item.menuItemId),
      name: item.productName ?? item.name,
      quantity: Number(item.quantity),
      qty: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      price: Number(item.unitPrice),
      unitPricePaise: item.unitPricePaise,
      totalPricePaise: item.totalPricePaise,
      variantId: item.variantId,
      variantName: item.variantName,
      categoryName: item.categoryName,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    deliveryCharge: order.deliveryCharge,
    totalAmount: order.totalAmount,
    totalPaise: order.totalPaise,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    stateVersion: Number(order.stateVersion ?? 0),
    statusHistory: order.statusHistory,
    deliveryAddress: order.deliveryAddress,
    specialInstructions: order.specialInstructions,
    createdAt: order.createdAt,
    estimatedDeliveryTime: order.estimatedDeliveryTime,
    estimatedReadyTime: order.estimatedReadyTime,
    servedAt: order.servedAt,
    servedByName: order.servedByName,
    actualDeliveryTime: order.actualDeliveryTime,
    cancellationReason: order.cancellationReason,
    refundDuePaise: order.refundDuePaise,
  };
}

export async function GET(req: NextRequest) {
  try {
    const principal = await resolveOrderPrincipal(req);

    const url = new URL(req.url);
    const pageValue = Number(url.searchParams.get('page') ?? 1);
    const limitValue = Number(url.searchParams.get('limit') ?? 10);
    const page = Number.isInteger(pageValue) ? Math.max(1, pageValue) : 1;
    const limit = Number.isInteger(limitValue) ? Math.min(50, Math.max(1, limitValue)) : 10;
    const status = url.searchParams.get('status') ?? 'all';
    if (status !== 'all' && !(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });
    }

    if (!principal) {
      return NextResponse.json({
        ok: true,
        orders: [],
        total: 0,
        page,
        pages: 0,
        identity: 'guest',
        historyScope: 'this_browser',
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const filter: Record<string, unknown> = orderOwnershipFilter(principal);
    if (status !== 'all') filter.orderStatus = status;
    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .select('-idempotencyKey -requestFingerprint -adminNotes')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      ok: true,
      orders: orders.map(publicOrder),
      total,
      page,
      pages: Math.ceil(total / limit),
      identity: principal.identityType,
      historyScope: principal.kind === 'guest' ? 'this_browser' : 'account',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrderPrincipalError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    logServerError({ route: 'GET /api/user/orders', err: error, requestId: req.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  let principal: OrderPrincipal | null = null;
  try {
    const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? '';
    const payload = await req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return createOrderResponse(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        400,
      );
    }

    principal = await resolveOrderPrincipal(req, { createGuest: true });
    if (!principal) return createOrderResponse({ ok: false, error: 'UNAUTHENTICATED' }, 401);

    let limited;
    try {
      const subject = principal.kind === 'account' ? `account:${principal.accountId}` : `guest:${principal.guestSessionId}`;
      limited = await distributedRateLimit(`checkout:${subject}`, 5, 60);
    } catch {
      return createOrderResponse({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, 503, undefined, principal);
    }
    if (!limited.allowed) {
      return createOrderResponse(
        { ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter },
        429,
        { 'Retry-After': String(limited.retryAfter ?? 60) },
        principal,
      );
    }

    const recoveryGuest = principal.kind === 'account' ? await getGuestSessionFromRequest(req) : null;
    const result = await createCustomerOrder({
      userId: principal.kind === 'account' ? principal.accountId : undefined,
      guestSessionId: principal.kind === 'guest' ? principal.guestSessionId : undefined,
      recoveryGuestSessionId: recoveryGuest?.id,
      identityType: principal.identityType,
      customerName: parsed.data.customerName,
      input: parsed.data,
      idempotencyKey,
    });
    return createOrderResponse(
      { ok: true, ...result },
      result.duplicate ? 200 : 201,
      undefined,
      principal,
    );
  } catch (error) {
    if (error instanceof OrderPrincipalError) {
      return createOrderResponse({ ok: false, error: error.code }, error.status, undefined, principal);
    }
    if (error instanceof OrderServiceError) {
      return createOrderResponse(
        { ok: false, error: error.code, message: publicApiErrorMessage(error.code, error.details), details: error.details },
        error.status,
        undefined,
        principal,
      );
    }
    if (error instanceof BusinessRulesConfigurationError) {
      return createOrderResponse(
        { ok: false, error: 'CHECKOUT_NOT_CONFIGURED', details: { missing: error.missing } },
        503,
        undefined,
        principal,
      );
    }
    const message = error instanceof Error ? error.message : '';
    if (/Transaction numbers are only allowed|replica set|Transaction support/i.test(message)) {
      return createOrderResponse(
        { ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' },
        503,
        undefined,
        principal,
      );
    }
    logServerError({ route: 'POST /api/user/orders', err: error, requestId: req.headers.get('x-request-id') });
    return createOrderResponse({ ok: false, error: 'ORDER_CREATION_FAILED' }, 500, undefined, principal);
  }
}
