import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Coupon } from '@/models/Coupon';
import { isAdminJwtAuthed } from '@/lib/adminJwt';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const schema = z.object({
      code: z.string().min(1),
      discountType: z.enum(['percentage', 'fixed']),
      discountValue: z.number().positive(),
      minOrderValue: z.number().min(0).optional(),
      maxDiscount: z.number().min(0).nullable().optional(),
      applicableCategories: z.array(z.string()).optional(),
      usageLimit: z.number().int().positive().nullable().optional(),
      expiresAt: z.string().datetime(),
      isActive: z.boolean().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    await connectToMongo();
    const newCoupon = await Coupon.create({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      expiresAt: new Date(parsed.data.expiresAt),
      minOrderValue: parsed.data.minOrderValue ?? 0,
      maxDiscount: parsed.data.maxDiscount ?? null,
      applicableCategories: parsed.data.applicableCategories ?? [],
      usageLimit: parsed.data.usageLimit ?? null,
      isActive: parsed.data.isActive ?? true,
      createdBy: null,
    });
    return NextResponse.json(newCoupon, { status: 201 });
  } catch (err: unknown) {
    console.error('[POST /api/coupons]', err);
    // Duplicate key
    if (err && typeof err === 'object' && 'code' in err && (err as {code: number}).code === 11000) {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
