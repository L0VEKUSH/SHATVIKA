import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { MenuItem } from '@/models/MenuItem';
import { Coupon } from '@/models/Coupon';
import { User } from '@/models/User';
import { verifyCustomerToken } from '@/lib/customerJwt';
import { z } from 'zod';
import { getCustomerId } from '@/lib/customerAuth';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)customer_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertCustomerAuth(req: NextRequest) {
  const token = getTokenFromCookies(req.headers.get('cookie'));
  if (!token) throw new Error('UNAUTHENTICATED');
  
  const isValid = await verifyCustomerToken(token);
  if (!isValid) throw new Error('UNAUTHENTICATED'); // expired or invalid JWT → treat as unauthenticated
  
  return token;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getCustomerId();
    if (!userId) throw new Error('UNAUTHENTICATED');
    await assertCustomerAuth(req);
    await connectToMongo();

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)));
    const status = url.searchParams.get('status') ?? 'all';

    const filter: Record<string, unknown> = { userId };
    if (status && status !== 'all') {
      filter.orderStatus = status;
    }

    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return NextResponse.json({
      ok: true,
      orders: orders.map((o: any) => ({
        id: o._id?.toString(),
        orderNumber: o._id?.toString().slice(0, 8),
        items: (o.items || []).map((item: any) => ({
          name: item.name,
          qty: item.quantity,
          price: item.unitPrice,
          variantName: item.variantName,
        })),
        subtotal: o.subtotal,
        discount: o.discount,
        tax: o.tax,
        deliveryCharge: o.deliveryCharge,
        totalAmount: o.totalAmount,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        estimatedDeliveryTime: o.estimatedDeliveryTime,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[GET /api/user/orders]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

const createOrderSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      variantId: z.string().min(1),
      quantity: z.number().int().min(1).max(10),
    })
  ).min(1),
  deliveryAddressId: z.string().min(1),
  paymentMethod: z.enum(['card', 'upi', 'wallet', 'cash']),
  couponCode: z.string().optional(),
  specialInstructions: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getCustomerId();
    if (!userId) throw new Error('UNAUTHENTICATED');
    await assertCustomerAuth(req);
    await connectToMongo();

    // Rate limit: 5 orders per minute per user to prevent duplicate clicks
    const rateLimitResult = rateLimit(`order:${userId}`, 5, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Idempotency key to prevent duplicate orders from refreshes / double-submits
    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existing = await Order.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        idempotencyKey,
      }).lean();
      if (existing) {
        return NextResponse.json(
          {
            ok: true,
            orderId: String((existing as any)._id),
            orderNumber: String((existing as any)._id).slice(-8),
            totalAmount: (existing as any).totalAmount,
            estimatedDeliveryTime: new Date(Date.now() + 45 * 60000).toISOString(),
            paymentStatus: (existing as any).paymentStatus,
            duplicate: true,
          },
          { status: 200 }
        );
      }
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    const parsed = createOrderSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { items, deliveryAddressId, paymentMethod, couponCode, specialInstructions } = parsed.data;

    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    const deliveryAddress = user.addresses?.find((addr: any) => String(addr._id) === deliveryAddressId);
    if (!deliveryAddress) {
      return NextResponse.json({ ok: false, error: 'ADDRESS_NOT_FOUND' }, { status: 404 });
    }

    const menuItems = await MenuItem.find({ _id: { $in: items.map((item) => item.menuItemId) } }).lean();
    const menuItemMap = new Map(menuItems.map((item: any) => [String(item._id), item]));

    const orderItems: Array<{
      menuItemId: mongoose.Types.ObjectId;
      name: string;
      variantId: string;
      variantName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    let subtotal = 0;
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menuItemId);
      if (!menuItem || menuItem.available === false || menuItem.quantity < item.quantity) {
        return NextResponse.json({ ok: false, error: 'MENU_ITEM_UNAVAILABLE_OR_OUT_OF_STOCK' }, { status: 400 });
      }

      const variant = (menuItem.variants || []).find((entry: any) => entry.id === item.variantId);
      if (!variant || variant.available === false) {
        return NextResponse.json({ ok: false, error: 'VARIANT_UNAVAILABLE' }, { status: 400 });
      }

      const lineTotal = variant.price * item.quantity;
      subtotal += lineTotal;
      orderItems.push({
        menuItemId: new mongoose.Types.ObjectId(item.menuItemId),
        name: menuItem.name,
        variantId: item.variantId,
        variantName: variant.name,
        quantity: item.quantity,
        unitPrice: variant.price,
        totalPrice: roundMoney(lineTotal),
      });
    }

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).lean();
      if (!coupon) {
        return NextResponse.json({ ok: false, error: 'INVALID_COUPON' }, { status: 400 });
      }

      if (new Date(coupon.expiresAt) < new Date()) {
        return NextResponse.json({ ok: false, error: 'EXPIRED_COUPON' }, { status: 400 });
      }

      if (coupon.usageLimit !== null && typeof coupon.usageLimit === 'number' && coupon.usageCount >= coupon.usageLimit) {
        return NextResponse.json({ ok: false, error: 'COUPON_LIMIT_REACHED' }, { status: 400 });
      }

      const eligibleSubtotal = coupon.applicableCategories?.length
        ? orderItems.reduce((sum, orderItem) => {
            const sourceItem = menuItemMap.get(String(orderItem.menuItemId));
            if (!sourceItem || !coupon.applicableCategories.includes(sourceItem.category)) return sum;
            return sum + orderItem.totalPrice;
          }, 0)
        : subtotal;

      if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
        return NextResponse.json({ ok: false, error: 'MIN_ORDER_NOT_MET' }, { status: 400 });
      }

      discount = coupon.discountType === 'percentage'
        ? (eligibleSubtotal * coupon.discountValue) / 100
        : coupon.discountValue;

      if (coupon.maxDiscount !== null && typeof coupon.maxDiscount === 'number') {
        discount = Math.min(discount, coupon.maxDiscount);
      }

      discount = Math.min(discount, subtotal);
    }

    const taxableAmount = Math.max(0, subtotal - discount);
    const tax = roundMoney(taxableAmount * 0.18);
    const deliveryCharge = taxableAmount >= 500 ? 0 : 50;
    const totalAmount = roundMoney(taxableAmount + tax + deliveryCharge);

    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(userId),
      items: orderItems,
      subtotal: roundMoney(subtotal),
      discount: roundMoney(discount),
      couponCode: couponCode ? couponCode.toUpperCase() : null,
      tax,
      deliveryCharge,
      totalAmount,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      statusHistory: [{ status: 'pending', timestamp: new Date(), note: 'Order placed' }],
      deliveryAddress: {
        street: deliveryAddress.street,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        zipCode: deliveryAddress.zipCode,
        phone: deliveryAddress.phone,
      },
      specialInstructions: specialInstructions ?? null,
      customerNotes: null,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    if (couponCode) {
      await Coupon.updateOne(
        { code: couponCode.toUpperCase() },
        {
          $inc: { usageCount: 1 },
          $addToSet: { usedBy: new mongoose.Types.ObjectId(userId) },
        }
      );
    }

    // Decrement stock and increment sold count for each item
    for (const item of items) {
      await MenuItem.updateOne(
        { _id: new mongoose.Types.ObjectId(item.menuItemId) },
        {
          $inc: { 
            quantity: -item.quantity,
            quantitySold: item.quantity 
          }
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        orderId: String((order as any)._id),
        orderNumber: String((order as any)._id).slice(-8),
        totalAmount: order.totalAmount,
        estimatedDeliveryTime: new Date(Date.now() + 45 * 60000).toISOString(),
        paymentStatus: order.paymentStatus,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[POST /api/user/orders]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
