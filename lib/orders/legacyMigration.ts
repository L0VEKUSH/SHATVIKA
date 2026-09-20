import { rupeesToPaise } from '@/lib/money';

type LegacyRecord = Record<string, any>;

const LEGACY_STATUS_MAP: Record<string, string> = {
  Pending: 'pending',
  Accepted: 'accepted',
  Cooking: 'preparing',
  Preparing: 'preparing',
  Ready: 'ready',
  'Out for Delivery': 'out_for_delivery',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
};

function isSafeMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function derivedPaise(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return rupeesToPaise(value, field);
  } catch {
    return undefined;
  }
}

function categoryKey(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return key || undefined;
}

/**
 * Produces only evidence-preserving updates for a legacy order. Costs,
 * customer identity, payment totals and operational timestamps are never
 * inferred from current records or estimated values.
 */
export function legacyOrderPatch(order: LegacyRecord): LegacyRecord {
  const set: LegacyRecord = {};
  const moneyPairs = [
    ['subtotalPaise', 'subtotal'],
    ['discountPaise', 'discount'],
    ['taxPaise', 'tax'],
    ['deliveryChargePaise', 'deliveryCharge'],
    ['totalPaise', 'totalAmount'],
  ] as const;
  for (const [paiseField, legacyField] of moneyPairs) {
    if (isSafeMoney(order[paiseField])) continue;
    const value = derivedPaise(order[legacyField], legacyField);
    if (value !== undefined) set[paiseField] = value;
  }

  if (!order.inventoryState) set.inventoryState = 'unknown';
  if (!order.couponState) set.couponState = order.couponCode ? 'unknown' : 'none';
  if (typeof order.orderStatus === 'string' && LEGACY_STATUS_MAP[order.orderStatus]) {
    set.orderStatus = LEGACY_STATUS_MAP[order.orderStatus];
  }

  if (Array.isArray(order.items)) {
    let changed = false;
    const items = order.items.map((source: LegacyRecord) => {
      const item = { ...source };
      if (!isSafeMoney(item.unitPricePaise)) {
        const value = derivedPaise(item.unitPrice, 'items.unitPrice');
        if (value !== undefined) { item.unitPricePaise = value; changed = true; }
      }
      if (!isSafeMoney(item.totalPricePaise)) {
        const recorded = derivedPaise(item.totalPrice, 'items.totalPrice');
        const quantity = Number(item.quantity);
        const derived = recorded ?? (
          isSafeMoney(item.unitPricePaise) && Number.isSafeInteger(quantity) && quantity > 0
            ? item.unitPricePaise * quantity
            : undefined
        );
        if (isSafeMoney(derived)) { item.totalPricePaise = derived; changed = true; }
      }
      if (!item.productName && typeof item.name === 'string' && item.name.trim()) {
        item.productName = item.name.trim(); changed = true;
      }
      if (!item.variantId) { item.variantId = 'unknown'; changed = true; }
      if (!item.variantName) { item.variantName = 'Unknown legacy variant'; changed = true; }
      if (!item.categoryId) { item.categoryId = 'unknown'; changed = true; }
      if (!item.categoryName) { item.categoryName = 'Unknown'; changed = true; }
      // Explicit null means unavailable historical evidence, not zero cost.
      if (item.unitCostPaise === undefined) { item.unitCostPaise = null; changed = true; }
      return item;
    });
    if (changed) set.items = items;
  }

  return set;
}

export function legacyMenuItemPatch(item: LegacyRecord): LegacyRecord {
  const set: LegacyRecord = {};
  if (!isSafeMoney(item.basePricePaise)) {
    const value = derivedPaise(item.basePrice, 'basePrice');
    if (value !== undefined) set.basePricePaise = value;
  }
  if (!item.categoryId) {
    const value = categoryKey(item.category);
    if (value) set.categoryId = value;
  }
  if (Array.isArray(item.variants)) {
    let changed = false;
    const variants = item.variants.map((source: LegacyRecord) => {
      const variant = { ...source };
      if (!isSafeMoney(variant.pricePaise)) {
        const value = derivedPaise(variant.price, 'variants.price');
        if (value !== undefined) { variant.pricePaise = value; changed = true; }
      }
      if (variant.costPaise === undefined) { variant.costPaise = null; changed = true; }
      return variant;
    });
    if (changed) set.variants = variants;
  }
  if (item.costPaise === undefined) set.costPaise = null;
  return set;
}

export function legacyCouponPatch(coupon: LegacyRecord): LegacyRecord {
  const set: LegacyRecord = {};
  if (!isSafeMoney(coupon.minOrderPaise)) {
    const value = derivedPaise(coupon.minOrderValue, 'minOrderValue');
    if (value !== undefined) set.minOrderPaise = value;
  }
  if (coupon.discountType === 'fixed' && !isSafeMoney(coupon.fixedDiscountPaise)) {
    const value = derivedPaise(coupon.discountValue, 'discountValue');
    if (value !== undefined) set.fixedDiscountPaise = value;
  }
  if (coupon.maxDiscountPaise === undefined) {
    const value = derivedPaise(coupon.maxDiscount, 'maxDiscount');
    set.maxDiscountPaise = value ?? null;
  }
  return set;
}
