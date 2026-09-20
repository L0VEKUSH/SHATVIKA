import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { OrderServiceError, recordCounterPayment, transitionOrder } from '@/lib/orders/service';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';
import { Order } from '@/models/Order';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  orderStatus: z.enum(ORDER_STATUSES).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
  note: z.string().trim().max(500).optional(),
  adminNotes: z.string().trim().max(1000).nullable().optional(),
  paymentAction: z.enum(['collect', 'refund']).optional(),
  paymentMethod: z.enum(['cash', 'upi']).optional(),
  amountPaise: z.number().int().positive().optional(),
  transactionReference: z.string().trim().min(3).max(160).optional(),
  merchantReceiptVerified: z.boolean().optional(),
  allowUnpaidServeException: z.boolean().optional(),
  unpaidServeExceptionReason: z.string().trim().min(3).max(300).optional(),
}).strict().superRefine((value, context) => {
  const actions = Number(Boolean(value.orderStatus)) + Number(value.adminNotes !== undefined) + Number(Boolean(value.paymentAction));
  if (actions !== 1) context.addIssue({ code: 'custom', message: 'Submit exactly one update action' });
  if (value.orderStatus === 'cancelled' && !value.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A cancellation reason is required' });
  }
  if (value.paymentAction && value.amountPaise === undefined) {
    context.addIssue({ code: 'custom', path: ['amountPaise'], message: 'Payment amount is required' });
  }
  if (value.paymentAction === 'collect' && value.paymentMethod === 'upi' && (
    !value.merchantReceiptVerified || !value.transactionReference
  )) {
    context.addIssue({ code: 'custom', path: ['merchantReceiptVerified'], message: 'Verified merchant receipt and reference are required for UPI' });
  }
  if (value.allowUnpaidServeException && (value.orderStatus !== 'served' || !value.unpaidServeExceptionReason)) {
    context.addIssue({ code: 'custom', path: ['unpaidServeExceptionReason'], message: 'A serving exception reason is required' });
  }
});

function responseOrder(order: any) {
  const raw = typeof order.toObject === 'function' ? order.toObject() : order;
  return {
    ...raw,
    id: String(order._id),
    _id: String(order._id),
    requestFingerprint: undefined,
    idempotencyKey: undefined,
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ ok: false, error: 'INVALID_ORDER_ID' }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.orderStatus) {
      const order = await transitionOrder({
        orderId: id,
        nextStatus: parsed.data.orderStatus,
        actor: { type: 'admin', id: admin.accountId },
        expectedVersion: parsed.data.expectedVersion,
        reason: parsed.data.reason,
        note: parsed.data.note,
        allowUnpaidServeException: parsed.data.allowUnpaidServeException,
        unpaidServeExceptionReason: parsed.data.unpaidServeExceptionReason,
      });
      return NextResponse.json({ ok: true, order: responseOrder(order) });
    }

    if (parsed.data.paymentAction && parsed.data.amountPaise) {
      const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
      const result = await recordCounterPayment({
        orderId: id,
        action: parsed.data.paymentAction,
        method: parsed.data.paymentMethod ?? 'cash',
        amountPaise: parsed.data.amountPaise,
        actorId: admin.accountId,
        actorType: 'admin',
        idempotencyKey,
        transactionReference: parsed.data.transactionReference,
        receiptVerified: parsed.data.merchantReceiptVerified,
        note: parsed.data.note,
      });
      return NextResponse.json({
        ok: true,
        order: responseOrder(result.order),
        paymentEventId: String(result.event._id),
        duplicate: result.duplicate,
      });
    }

    await connectToMongo();
    const versionFilter = parsed.data.expectedVersion === undefined
      ? {}
      : { stateVersion: parsed.data.expectedVersion };
    const updated = await Order.findOneAndUpdate(
      { _id: id, ...versionFilter },
      { $set: { adminNotes: parsed.data.adminNotes ?? null }, $inc: { stateVersion: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).select('-requestFingerprint -idempotencyKey');
    if (!updated) {
      const current = await Order.findById(id).select('stateVersion').lean();
      return NextResponse.json(
        { ok: false, error: current ? 'STALE_ORDER_VERSION' : 'ORDER_NOT_FOUND', details: current ?? undefined },
        { status: current ? 409 : 404 },
      );
    }
    return NextResponse.json({ ok: true, order: responseOrder(updated) });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: error.status });
    }
    console.error('[PUT /api/orders/:id]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'ORDER_UPDATE_FAILED' }, { status: 500 });
  }
}
