import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['Pending', 'Cooking', 'Out for Delivery', 'Delivered', 'Cancelled'];

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

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    await connectToMongo();
    const updated = await Order.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PUT /api/orders/:id]', err);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
