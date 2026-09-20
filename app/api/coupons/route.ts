import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { Coupon } from '@/models/Coupon';

export const dynamic = 'force-dynamic';

const couponSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive().max(1_000_000),
  minOrderValue: z.number().nonnegative().max(1_000_000).optional(),
  maxDiscount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  applicableCategories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().positive().max(100).optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }),
  isActive: z.boolean().optional(),
}).strict().superRefine((coupon, context) => {
  if (coupon.discountType === 'percentage' && coupon.discountValue > 100) {
    context.addIssue({ code: 'custom', path: ['discountValue'], message: 'Percentage cannot exceed 100' });
  }
  if (coupon.startsAt && new Date(coupon.startsAt) >= new Date(coupon.expiresAt)) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be after the start date' });
  }
});

export async function GET(request: NextRequest) {
  const adminRequested = request.nextUrl.searchParams.get('scope') === 'admin';
  if (adminRequested) {
    const admin = await getAdminSessionState();
    if (admin.status !== 'valid') {
      return NextResponse.json({ ok: false, error: admin.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: admin.status === 'database_unavailable' ? 503 : 401 });
    }
  }
  try {
    await connectToMongo();
    const now = new Date();
    const filter = adminRequested ? {} : {
      isActive: true,
      visibility: { $ne: 'private' },
      expiresAt: { $gt: now },
      $or: [{ startsAt: null }, { startsAt: { $lte: now } }],
    };
    const query = Coupon.find(filter).sort({ createdAt: -1 });
    if (!adminRequested) {
      query.select('code discountType discountValue minOrderValue maxDiscount applicableCategories expiresAt isActive visibility');
    }
    const coupons = await query.lean();
    return NextResponse.json(
      { ok: true, coupons },
      { headers: { 'Cache-Control': adminRequested ? 'private, no-store' : 'public, max-age=30' } },
    );
  } catch (error) {
    console.error('[GET /api/coupons]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'COUPONS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSessionState();
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: admin.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: admin.status === 'database_unavailable' ? 503 : 401 });
  }
  const parsed = couponSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const created = await Coupon.create({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      expiresAt: new Date(parsed.data.expiresAt),
      createdBy: admin.accountId,
    });
    return NextResponse.json({ ok: true, coupon: created.toJSON() }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'COUPON_CODE_EXISTS' }, { status: 409 });
    }
    console.error('[POST /api/coupons]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'COUPON_CREATE_FAILED' }, { status: 500 });
  }
}
