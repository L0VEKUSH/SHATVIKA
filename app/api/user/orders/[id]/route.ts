import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { User } from '@/models/User';
import { verifyCustomerToken } from '@/lib/customerJwt';
import { z } from 'zod';
import { getCustomerId } from '@/lib/customerAuth';

function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)customer_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertCustomerAuth(req: NextRequest) {
  const token = getTokenFromCookies(req.headers.get('cookie'));
  if (!token) throw new Error('UNAUTHENTICATED');
  
  const isValid = await verifyCustomerToken(token);
  if (!isValid) throw new Error('UNAUTHORIZED');
  
  return token;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCustomerId();
    await assertCustomerAuth(req);
    await connectToMongo();

    const { id } = await params;

    const order = await Order.findOne({ _id: id, userId }).lean();
    if (!order) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order._id?.toString(),
        orderNumber: order._id?.toString().slice(0, 8),
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        deliveryCharge: order.deliveryCharge,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        statusHistory: order.statusHistory,
        deliveryAddress: order.deliveryAddress,
        specialInstructions: order.specialInstructions,
        customerNotes: order.customerNotes,
        createdAt: order.createdAt,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        actualDeliveryTime: order.actualDeliveryTime,
      },
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[GET /api/user/orders/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

const updateOrderSchema = z.object({
  specialInstructions: z.string().max(500).optional(),
  customerNotes: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCustomerId();
    await assertCustomerAuth(req);
    await connectToMongo();

    const { id } = await params;

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = updateOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await Order.findOneAndUpdate(
      { _id: id, userId },
      { $set: parsed.data },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: updated._id?.toString(),
        orderNumber: updated._id?.toString().slice(0, 8),
        items: updated.items,
        totalAmount: updated.totalAmount,
        orderStatus: updated.orderStatus,
      },
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[PATCH /api/user/orders/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCustomerId();
    await assertCustomerAuth(req);
    await connectToMongo();

    const { id } = await params;

    const order = await Order.findOne({ _id: id, userId });
    if (!order) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    // Only allow cancellation while the order is still in progress.
    if (!['pending', 'accepted', 'preparing'].includes(order.orderStatus)) {
      return NextResponse.json(
        { ok: false, error: 'CANNOT_CANCEL', details: { status: order.orderStatus } },
        { status: 400 }
      );
    }

    order.orderStatus = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by customer' });
    await order.save();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[DELETE /api/user/orders/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
