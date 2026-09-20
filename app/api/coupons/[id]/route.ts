import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { Coupon } from '@/models/Coupon';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().positive().max(1_000_000).optional(),
  minOrderValue: z.number().nonnegative().max(1_000_000).optional(),
  maxDiscount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  applicableCategories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().positive().max(100).optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().optional(),
}).strict();

async function requireAdmin() {
  const state = await getAdminSessionState();
  if (state.status === 'valid') return state;
  return NextResponse.json(
    { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' },
    { status: state.status === 'database_unavailable' ? 503 : 401 },
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }
  try {
    const coupon = await Coupon.findById(id);
    if (!coupon) return NextResponse.json({ ok: false, error: 'COUPON_NOT_FOUND' }, { status: 404 });
    const values = {
      ...parsed.data,
      ...(parsed.data.startsAt !== undefined ? { startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null } : {}),
      ...(parsed.data.expiresAt ? { expiresAt: new Date(parsed.data.expiresAt) } : {}),
    };
    coupon.set(values);
    if (coupon.discountType === 'percentage' && coupon.discountValue > 100) {
      return NextResponse.json({ ok: false, error: 'INVALID_PERCENTAGE' }, { status: 400 });
    }
    if (coupon.startsAt && coupon.startsAt >= coupon.expiresAt) {
      return NextResponse.json({ ok: false, error: 'INVALID_DATE_RANGE' }, { status: 400 });
    }
    await coupon.save();
    return NextResponse.json({ ok: true, coupon: coupon.toJSON() });
  } catch (error) {
    console.error('[PUT /api/coupons/:id]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'COUPON_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  const disabled = await Coupon.findByIdAndUpdate(id, { $set: { isActive: false } }, { returnDocument: 'after' }).lean();
  if (!disabled) return NextResponse.json({ ok: false, error: 'COUPON_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, id, disabled: true });
}
