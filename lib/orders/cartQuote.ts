import mongoose from 'mongoose';
import { calculateOrderTotals, getBusinessRules } from '@/lib/businessRules';
import { legacyRupeesOrPaise, paiseToRupees, percentageOfPaise } from '@/lib/money';
import { Coupon } from '@/models/Coupon';
import { CouponUsage } from '@/models/CouponUsage';
import { MenuItem } from '@/models/MenuItem';

export type CartLine = { menuItemId: string; variantId?: string; quantity: number };

export class CartQuoteError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(code);
    this.name = 'CartQuoteError';
  }
}

function normalizeLines(lines: CartLine[], maximum: number) {
  const grouped = new Map<string, Required<CartLine>>();
  for (const line of lines) {
    if (!mongoose.isValidObjectId(line.menuItemId)) throw new CartQuoteError('INVALID_MENU_ITEM_ID', 400);
    const variantId = line.variantId?.trim() || 'base';
    const key = `${line.menuItemId}:${variantId}`;
    const quantity = (grouped.get(key)?.quantity ?? 0) + line.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maximum) {
      throw new CartQuoteError('QUANTITY_LIMIT_EXCEEDED', 400, { maximum });
    }
    grouped.set(key, { menuItemId: line.menuItemId, variantId, quantity });
  }
  return [...grouped.values()];
}

export async function quoteCustomerCart(input: {
  userId: string;
  lines: CartLine[];
  couponCode?: string | null;
  now?: Date;
}) {
  if (!input.lines.length) {
    return {
      items: [], couponCode: null, coupon: null,
      subtotalPaise: 0, discountPaise: 0, taxablePaise: 0,
      taxPaise: 0, deliveryChargePaise: 0, totalPaise: 0,
      subtotal: 0, discount: 0, tax: 0, deliveryCharge: 0, totalAmount: 0,
    };
  }
  const rules = getBusinessRules();
  const lines = normalizeLines(input.lines, rules.maxQuantityPerItem);

  const products = await MenuItem.find({
    _id: { $in: [...new Set(lines.map(line => line.menuItemId))] },
    archivedAt: null,
  }).select('name category categoryId variants basePrice basePricePaise available quantity').lean();
  const productMap = new Map(products.map((product: any) => [String(product._id), product]));
  const stockByProduct = new Map<string, number>();
  const quotedItems: Array<Required<CartLine> & { categoryId: string; categoryName: string; lineTotalPaise: number }> = [];
  let subtotalPaise = 0;

  for (const line of lines) {
    const product: any = productMap.get(line.menuItemId);
    if (!product || product.available === false) throw new CartQuoteError('MENU_ITEM_UNAVAILABLE', 409);
    const variants: any[] = product.variants ?? [];
    const isBase = variants.length === 0 && line.variantId === 'base';
    const variant = isBase ? null : variants.find(entry => entry.id === line.variantId);
    if (!isBase && (!variant || variant.available === false)) throw new CartQuoteError('VARIANT_UNAVAILABLE', 409);
    const unitPricePaise = isBase
      ? legacyRupeesOrPaise(product.basePricePaise, product.basePrice, 'base price')
      : legacyRupeesOrPaise(variant.pricePaise, variant.price, 'variant price');
    const lineTotalPaise = unitPricePaise * line.quantity;
    subtotalPaise += lineTotalPaise;
    stockByProduct.set(line.menuItemId, (stockByProduct.get(line.menuItemId) ?? 0) + line.quantity);
    quotedItems.push({
      ...line,
      categoryId: product.categoryId || 'unknown',
      categoryName: product.category || 'Unknown',
      lineTotalPaise,
    });
  }
  for (const [productId, requested] of stockByProduct) {
    const available = Number(productMap.get(productId)?.quantity ?? 0);
    if (!Number.isSafeInteger(available) || available < requested) {
      throw new CartQuoteError('INSUFFICIENT_STOCK', 409, { menuItemId: productId, available });
    }
  }

  const now = input.now ?? new Date();
  const normalizedCoupon = input.couponCode?.trim().toUpperCase() || null;
  let discountPaise = 0;
  let couponSummary: null | { code: string; discountType: 'percentage' | 'fixed'; discountValue: number } = null;
  if (normalizedCoupon) {
    const coupon = await Coupon.findOne({ code: normalizedCoupon }).lean();
    if (!coupon) throw new CartQuoteError('COUPON_NOT_FOUND', 404);
    if (!coupon.isActive) throw new CartQuoteError('COUPON_INACTIVE', 400);
    if (coupon.startsAt && new Date(coupon.startsAt) > now) throw new CartQuoteError('COUPON_NOT_STARTED', 400);
    if (new Date(coupon.expiresAt) <= now) throw new CartQuoteError('COUPON_EXPIRED', 410);
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      throw new CartQuoteError('COUPON_LIMIT_REACHED', 409);
    }
    const usage = await CouponUsage.findOne({ couponId: coupon._id, userId: input.userId }).lean();
    if ((usage?.count ?? 0) >= (coupon.perCustomerLimit ?? 1)) {
      throw new CartQuoteError('COUPON_CUSTOMER_LIMIT_REACHED', 409);
    }
    const minimumPaise = legacyRupeesOrPaise(coupon.minOrderPaise, coupon.minOrderValue, 'coupon minimum');
    if (subtotalPaise < minimumPaise) throw new CartQuoteError('MINIMUM_ORDER_NOT_MET', 400, { minimumPaise });
    const categories = new Set<string>(coupon.applicableCategories ?? []);
    const eligibleSubtotalPaise = categories.size === 0
      ? subtotalPaise
      : quotedItems.reduce((sum, item) => (
        categories.has(item.categoryId) || categories.has(item.categoryName) ? sum + item.lineTotalPaise : sum
      ), 0);
    if (!eligibleSubtotalPaise) throw new CartQuoteError('COUPON_NOT_APPLICABLE', 400);
    discountPaise = coupon.discountType === 'percentage'
      ? percentageOfPaise(eligibleSubtotalPaise, Math.round(Number(coupon.discountValue) * 100))
      : legacyRupeesOrPaise(coupon.fixedDiscountPaise, coupon.discountValue, 'fixed discount');
    discountPaise = Math.min(discountPaise, eligibleSubtotalPaise);
    if (coupon.maxDiscountPaise != null || coupon.maxDiscount != null) {
      discountPaise = Math.min(
        discountPaise,
        legacyRupeesOrPaise(coupon.maxDiscountPaise, coupon.maxDiscount, 'coupon cap'),
      );
    }
    couponSummary = { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue };
  }

  const totals = calculateOrderTotals(subtotalPaise, discountPaise, rules, { fulfillmentType: 'counter' });
  return {
    items: lines,
    couponCode: couponSummary?.code ?? null,
    coupon: couponSummary,
    ...totals,
    subtotal: paiseToRupees(totals.subtotalPaise),
    discount: paiseToRupees(totals.discountPaise),
    tax: paiseToRupees(totals.taxPaise),
    deliveryCharge: paiseToRupees(totals.deliveryChargePaise),
    totalAmount: paiseToRupees(totals.totalPaise),
  };
}
