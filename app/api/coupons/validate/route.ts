import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Coupon } from '@/models/Coupon';
import { z } from 'zod';

const validateCouponSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  subtotal: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await connectToMongo();

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = validateCouponSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code, subtotal } = parsed.data;

    // Find coupon (case-insensitive)
    const coupon = await Coupon.findOne({ code: code.toUpperCase() }).lean();
    if (!coupon) {
      return NextResponse.json({ ok: false, error: 'COUPON_NOT_FOUND' }, { status: 404 });
    }

    // Check if active
    if (!coupon.isActive) {
      return NextResponse.json({ ok: false, error: 'COUPON_INACTIVE' }, { status: 400 });
    }

    // Check if expired
    if (new Date() > new Date(coupon.expiresAt)) {
      return NextResponse.json({ ok: false, error: 'COUPON_EXPIRED' }, { status: 410 });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return NextResponse.json({ ok: false, error: 'COUPON_LIMIT_REACHED' }, { status: 429 });
    }

    // Check minimum order value
    if (subtotal !== undefined && subtotal < (coupon.minOrderValue || 0)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'MINIMUM_ORDER_NOT_MET',
          details: { minOrderValue: coupon.minOrderValue || 0, provided: subtotal },
        },
        { status: 400 }
      );
    }

    // Calculate discount
    let calculatedDiscount = 0;
    if (subtotal !== undefined) {
      if (coupon.discountType === 'percentage') {
        calculatedDiscount = (subtotal * coupon.discountValue) / 100;
      } else if (coupon.discountType === 'fixed') {
        calculatedDiscount = coupon.discountValue;
      }

      // Cap at maxDiscount if set
      if (coupon.maxDiscount && calculatedDiscount > coupon.maxDiscount) {
        calculatedDiscount = coupon.maxDiscount;
      }
    }

    return NextResponse.json({
      ok: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        applicableCategories: coupon.applicableCategories,
      },
      calculatedDiscount,
    });
  } catch (err) {
    console.error('[POST /api/coupons/validate]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
