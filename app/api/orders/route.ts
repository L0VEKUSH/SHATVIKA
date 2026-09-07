import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToMongo();
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(orders);
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(
      { error: 'Use /api/user/orders for customer checkout' },
      { status: 405 }
    );
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
