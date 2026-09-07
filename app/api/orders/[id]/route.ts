import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    const nextOrderStatus = body.orderStatus ?? body.status;
    if (nextOrderStatus && !VALID_STATUSES.includes(String(nextOrderStatus))) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    await connectToMongo();

    const update: Record<string, unknown> = {};
    if (body.orderStatus || body.status) update.orderStatus = String(nextOrderStatus);
    if (body.paymentStatus) update.paymentStatus = body.paymentStatus;
    if (body.adminNotes !== undefined) update.adminNotes = body.adminNotes;
    if (body.estimatedDeliveryTime !== undefined) update.estimatedDeliveryTime = body.estimatedDeliveryTime;
    if (body.actualDeliveryTime !== undefined) update.actualDeliveryTime = body.actualDeliveryTime;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const updated = await Order.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PUT /api/orders/:id]', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
