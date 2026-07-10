import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Coupon } from '@/models/Coupon';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToMongo();
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(coupons);
  } catch (err) {
    console.error('[GET /api/coupons]', err);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || !body.code || !body.discountPercent || !body.expiry) {
      return NextResponse.json(
        { error: 'code, discountPercent and expiry are required' },
        { status: 400 }
      );
    }

    await connectToMongo();
    const newCoupon = await Coupon.create(body);
    return NextResponse.json(newCoupon, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/coupons]', err);
    // Duplicate key
    if (err?.code === 11000) {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
