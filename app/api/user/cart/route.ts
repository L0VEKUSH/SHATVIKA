import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { User } from '@/models/User';
import { MenuItem } from '@/models/MenuItem';
import { Coupon } from '@/models/Coupon';
import { verifyCustomerToken } from '@/lib/customerJwt';
import { getCustomerId } from '@/lib/customerAuth';
import { z } from 'zod';

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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

async function calculateTotals(
  items: Array<{ menuItemId: string; variantId: string; quantity: number }>,
  couponCode?: string | null
) {
  const menuItems = await MenuItem.find({
    _id: { $in: items.map(i => i.menuItemId) },
  }).lean();

  const menuMap = new Map(menuItems.map((m: any) => [String(m._id), m]));

  let subtotal = 0;
  for (const item of items) {
    const menuItem = menuMap.get(item.menuItemId);
    if (!menuItem) continue;
    const variant = (menuItem.variants ?? []).find((v: any) => v.id === item.variantId);
    const unitPrice = variant?.price ?? menuItem.basePrice ?? 0;
    subtotal += unitPrice * item.quantity;
  }

  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() }).lean();
    if (coupon && coupon.isActive && new Date() <= new Date(coupon.expiresAt)) {
      if (coupon.discountType === 'percentage') {
        discount = (subtotal * coupon.discountValue) / 100;
      } else {
        discount = coupon.discountValue;
      }
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }
  }

  const tax = roundMoney((subtotal - discount) * 0.18);
  const deliveryCharge = subtotal > 500 ? 0 : 50;
  const totalAmount = roundMoney(subtotal - discount + tax + deliveryCharge);

  return { subtotal: roundMoney(subtotal), discount: roundMoney(discount), tax, deliveryCharge, totalAmount };
}

export async function GET(req: NextRequest) {
  try {
    await assertCustomerAuth(req);
    const userId = await getCustomerId();
    if (!userId) throw new Error('UNAUTHENTICATED');

    await connectToMongo();
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('UNAUTHORIZED');

    const cartItems = (user.cart?.items ?? []).map((item: any) => ({
      menuItemId: String(item.menuItemId),
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    const totals = cartItems.length > 0
      ? await calculateTotals(cartItems, user.cart?.couponCode)
      : { subtotal: 0, discount: 0, tax: 0, deliveryCharge: 0, totalAmount: 0 };

    return NextResponse.json({
      ok: true,
      cart: {
        items: cartItems,
        couponCode: user.cart?.couponCode ?? null,
      },
      totals,
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED' || err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[GET /api/user/cart]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

const syncCartSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      variantId: z.string().min(1),
      quantity: z.number().int().min(1).max(10),
    })
  ),
  couponCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await assertCustomerAuth(req);
    const userId = await getCustomerId();
    if (!userId) throw new Error('UNAUTHENTICATED');

    await connectToMongo();

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = syncCartSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { items, couponCode } = parsed.data;

    await User.findByIdAndUpdate(userId, {
      $set: {
        'cart.items': items,
        'cart.couponCode': couponCode ?? null,
        'cart.lastUpdated': new Date(),
      },
    });

    const totals = await calculateTotals(items, couponCode);

    return NextResponse.json({
      ok: true,
      cart: {
        items,
        couponCode: couponCode || null,
      },
      totals,
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED' || err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[POST /api/user/cart]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
