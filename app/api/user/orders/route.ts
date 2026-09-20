import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToMongo } from '@/lib/mongoose';
import { getCustomerId, isCustomerAuthed } from '@/lib/customerAuth';
import { distributedRateLimit } from '@/lib/rateLimit';
import { BusinessRulesConfigurationError } from '@/lib/businessRules';
import { createCustomerOrder, OrderServiceError } from '@/lib/orders/service';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';
import { Order } from '@/models/Order';

export const dynamic = 'force-dynamic';

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

async function authenticatedCustomerId(): Promise<string | null> {
  // Connect first so a cold-start database outage is not mistaken for an invalid session.
  await connectToMongo();
  if (!(await isCustomerAuthed())) return null;
  return getCustomerId();
}

export async function GET(req: NextRequest) {
  try {
    const userId = await authenticatedCustomerId();
    if (!userId) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });

    const url = new URL(req.url);
    const pageValue = Number(url.searchParams.get('page') ?? 1);
    const limitValue = Number(url.searchParams.get('limit') ?? 10);
    const page = Number.isInteger(pageValue) ? Math.max(1, pageValue) : 1;
    const limit = Number.isInteger(limitValue) ? Math.min(50, Math.max(1, limitValue)) : 10;
    const status = url.searchParams.get('status') ?? 'all';
    if (status !== 'all' && !(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });
    }

    const filter: Record<string, unknown> = { userId };
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
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/user/orders]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await authenticatedCustomerId();
    if (!userId) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });

    let limited;
    try {
      limited = await distributedRateLimit(`checkout:${userId}`, 5, 60);
    } catch {
      return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503 });
    }
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } },
      );
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? '';
    const payload = await req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await createCustomerOrder({ userId, input: parsed.data, idempotencyKey });
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.duplicate ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return NextResponse.json(
        { ok: false, error: error.code, details: error.details },
        { status: error.status },
      );
    }
    if (error instanceof BusinessRulesConfigurationError) {
      return NextResponse.json(
        { ok: false, error: 'CHECKOUT_NOT_CONFIGURED', details: { missing: error.missing } },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : '';
    if (/Transaction numbers are only allowed|replica set|Transaction support/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: 'TRANSACTION_DATABASE_REQUIRED' },
        { status: 503 },
      );
    }
    console.error('[POST /api/user/orders]', message || 'Unknown error');
    return NextResponse.json({ ok: false, error: 'ORDER_CREATION_FAILED' }, { status: 500 });
  }
}
