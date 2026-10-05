import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError } from '@/lib/apiError';
import { OrderServiceError, transitionOrder } from '@/lib/orders/service';
import {
  OrderPrincipalError,
  orderOwnershipFilter,
  resolveOrderPrincipal,
} from '@/lib/orderPrincipal';
import { Order } from '@/models/Order';
import { operationalReasonSchema, validationErrorResponse } from '@/lib/validation';

const notesSchema = z.object({
  specialInstructions: z.string().trim().max(500).optional(),
  customerNotes: z.string().trim().max(500).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
}).strict();

const cancellationSchema = z.object({
  reason: operationalReasonSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
}).strict();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await resolveOrderPrincipal(_req);
    if (!principal) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ ok: false, error: 'INVALID_ORDER_ID' }, { status: 400 });
    }
    const order = await Order.findOne({ _id: id, ...orderOwnershipFilter(principal) })
      .select('-idempotencyKey -requestFingerprint -adminNotes')
      .lean();
    if (!order) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      order: {
        id: String(order._id),
        orderNumber: order.tokenNumber ?? String(order._id).slice(-8),
        tokenNumber: order.tokenNumber ?? null,
        tokenBusinessDate: order.tokenBusinessDate ?? null,
        fulfillmentType: order.fulfillmentType ?? 'delivery',
        fulfillmentLocationId: order.fulfillmentLocationId ?? null,
        fulfillmentLocationName: order.fulfillmentLocationName ?? null,
        items: order.items,
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
        customerNotes: order.customerNotes,
        cancellationReason: order.cancellationReason,
        refundDuePaise: order.refundDuePaise,
        createdAt: order.createdAt,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        actualDeliveryTime: order.actualDeliveryTime,
        estimatedReadyTime: order.estimatedReadyTime,
        servedAt: order.servedAt,
        servedByName: order.servedByName,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrderPrincipalError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    logServerError({ route: 'GET /api/user/orders/:id', err: error, requestId: _req.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await resolveOrderPrincipal(req);
    if (!principal) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ ok: false, error: 'INVALID_ORDER_ID' }, { status: 400 });
    }
    const parsed = notesSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }
    const { expectedVersion, ...changes } = parsed.data;
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ ok: false, error: 'NOTHING_TO_UPDATE' }, { status: 400 });
    }
    const versionFilter = expectedVersion === undefined ? {} : { stateVersion: expectedVersion };
    const updated = await Order.findOneAndUpdate(
      { _id: id, ...orderOwnershipFilter(principal), orderStatus: { $in: ['placed', 'pending', 'accepted'] }, ...versionFilter },
      { $set: changes, $inc: { stateVersion: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).select('-idempotencyKey -requestFingerprint -adminNotes').lean();
    if (!updated) {
      const exists = await Order.findOne({ _id: id, ...orderOwnershipFilter(principal) }).select('orderStatus stateVersion').lean();
      if (!exists) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
      return NextResponse.json({
        ok: false,
        error: expectedVersion !== undefined && Number(exists.stateVersion) !== expectedVersion
          ? 'STALE_ORDER_VERSION'
          : 'ORDER_NOT_EDITABLE',
        details: { currentStatus: exists.orderStatus, currentVersion: exists.stateVersion },
      }, { status: 409 });
    }
    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    if (error instanceof OrderPrincipalError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    logServerError({ route: 'PATCH /api/user/orders/:id', err: error, requestId: req.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await resolveOrderPrincipal(req);
    if (!principal) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    const { id } = await params;
    const parsed = cancellationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return validationErrorResponse(parsed.error, 'Provide a cancellation reason between 3 and 300 characters.');
    }
    const order = await transitionOrder({
      orderId: id,
      nextStatus: 'cancelled',
      actor: principal.kind === 'account'
        ? { type: 'customer', id: principal.accountId }
        : { type: 'guest', id: principal.guestSessionId },
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
    });
    return NextResponse.json({
      ok: true,
      order: {
        id: String(order._id),
        orderStatus: order.orderStatus,
        stateVersion: order.stateVersion,
        refundDuePaise: order.refundDuePaise,
      },
    });
  } catch (error) {
    if (error instanceof OrderPrincipalError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    }
    if (error instanceof OrderServiceError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: error.status });
    }
    logServerError({ route: 'DELETE /api/user/orders/:id', err: error, requestId: req.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'CANCELLATION_FAILED' }, { status: 500 });
  }
}
