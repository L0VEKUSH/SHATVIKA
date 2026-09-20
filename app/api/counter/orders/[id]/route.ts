import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderServiceError, transitionOrder } from '@/lib/orders/service';
import { distributedRateLimit } from '@/lib/rateLimit';
import { getWorkerSessionState } from '@/lib/workerJwt';

const updateSchema = z.object({
  orderStatus: z.enum(['accepted', 'preparing', 'ready', 'served', 'cancelled']),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(300).optional(),
  note: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.orderStatus === 'cancelled' && !value.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A cancellation reason is required' });
  }
});

function responseOrder(order: any) {
  return {
    id: String(order._id),
    tokenNumber: order.tokenNumber,
    tokenBusinessDate: order.tokenBusinessDate,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    collectedPaise: Number(order.collectedPaise ?? 0),
    refundedPaise: Number(order.refundedPaise ?? 0),
    refundDuePaise: Number(order.refundDuePaise ?? 0),
    stateVersion: Number(order.stateVersion ?? 0),
    servedAt: order.servedAt,
    servedByName: order.servedByName,
    cancellationReason: order.cancellationReason,
    statusHistory: order.statusHistory,
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const worker = await getWorkerSessionState();
  if (worker.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (worker.status !== 'valid' || !worker.permissions.includes('counter:operate')) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const limited = await distributedRateLimit(`counter-update:${worker.accountId}`, 90, 60);
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, { status: 429 });
    }
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    }
    const { id } = await params;
    const order = await transitionOrder({
      orderId: id,
      nextStatus: parsed.data.orderStatus,
      actor: { type: 'worker', id: worker.accountId, name: worker.name },
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
      note: parsed.data.note,
      requiredLocationId: worker.locationId,
    });
    return NextResponse.json({ ok: true, order: responseOrder(order) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: 'COUNTER_UPDATE_FAILED' }, { status: 500 });
  }
}
