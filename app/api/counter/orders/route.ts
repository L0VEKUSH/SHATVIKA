import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { businessDateKey } from '@/lib/orders/token';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';
import { distributedRateLimit } from '@/lib/rateLimit';
import { getWorkerSessionState } from '@/lib/workerJwt';
import { Order } from '@/models/Order';

export const dynamic = 'force-dynamic';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queueOrder(order: any) {
  return {
    id: String(order._id),
    tokenNumber: order.tokenNumber,
    tokenBusinessDate: order.tokenBusinessDate,
    createdAt: order.createdAt,
    estimatedReadyTime: order.estimatedReadyTime,
    items: (order.items ?? []).map((item: any) => ({
      name: item.productName ?? item.name,
      variantName: item.variantName,
      quantity: Number(item.quantity),
      unitPricePaise: Number(item.unitPricePaise),
      totalPricePaise: Number(item.totalPricePaise),
    })),
    specialInstructions: order.specialInstructions,
    subtotalPaise: Number(order.subtotalPaise),
    discountPaise: Number(order.discountPaise),
    taxPaise: Number(order.taxPaise),
    totalPaise: Number(order.totalPaise),
    collectedPaise: Number(order.collectedPaise ?? 0),
    refundedPaise: Number(order.refundedPaise ?? 0),
    refundDuePaise: Number(order.refundDuePaise ?? 0),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    stateVersion: Number(order.stateVersion ?? 0),
    statusHistory: order.statusHistory ?? [],
    cancellationReason: order.cancellationReason,
    servedAt: order.servedAt,
    servedByName: order.servedByName,
  };
}

export async function GET(request: NextRequest) {
  const worker = await getWorkerSessionState();
  if (worker.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (worker.status !== 'valid' || !worker.permissions.includes('counter:operate')) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const limited = await distributedRateLimit(`counter-orders:${worker.accountId}`, 240, 60);
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, {
        status: 429,
        headers: { 'Retry-After': String(limited.retryAfter ?? 60) },
      });
    }
    const url = new URL(request.url);
    const requestedDate = url.searchParams.get('businessDate')?.trim()
      || businessDateKey(new Date(), getFulfillmentCapabilities().timeZone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ ok: false, error: 'INVALID_BUSINESS_DATE' }, { status: 400 });
    }
    const status = url.searchParams.get('status')?.trim() || 'active';
    if (status !== 'active' && status !== 'all' && !(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });
    }
    const search = url.searchParams.get('search')?.trim().slice(0, 80) || '';
    const pageInput = Number(url.searchParams.get('page') ?? 1);
    const limitInput = Number(url.searchParams.get('limit') ?? 40);
    const page = Number.isSafeInteger(pageInput) ? Math.max(1, pageInput) : 1;
    const limit = Number.isSafeInteger(limitInput) ? Math.min(100, Math.max(1, limitInput)) : 40;

    const filter: Record<string, unknown> = {
      fulfillmentType: 'counter',
      fulfillmentLocationId: worker.locationId,
      tokenBusinessDate: requestedDate,
    };
    if (status === 'active') filter.orderStatus = { $in: ['placed', 'accepted', 'preparing', 'ready'] };
    else if (status !== 'all') filter.orderStatus = status;
    if (search) {
      const choices: Record<string, unknown>[] = [
        { tokenNumber: { $regex: `^${escapeRegex(search)}`, $options: 'i' } },
      ];
      if (mongoose.isValidObjectId(search)) choices.push({ _id: search });
      filter.$or = choices;
    }

    await connectToMongo();
    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .select('-customerSnapshot -deliveryAddress -idempotencyKey -requestFingerprint -adminNotes')
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    return NextResponse.json({
      ok: true,
      orders: orders.map(queueOrder),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      businessDate: requestedDate,
      locationId: worker.locationId,
      lastRefreshedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'COUNTER_QUEUE_UNAVAILABLE' }, { status: 503 });
  }
}
