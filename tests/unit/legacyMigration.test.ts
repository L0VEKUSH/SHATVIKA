import { describe, expect, it } from 'vitest';
import {
  legacyCouponPatch,
  legacyMenuItemPatch,
  legacyOrderPatch,
} from '@/lib/orders/legacyMigration';

describe('legacy record migration planning', () => {
  it('derives stored monetary snapshots while preserving unknown history', () => {
    expect(legacyOrderPatch({
      subtotal: 110.25,
      discount: 10,
      tax: 5.01,
      deliveryCharge: 20,
      totalAmount: 125.26,
      couponCode: 'OLD10',
      orderStatus: 'Cooking',
      items: [{ name: 'Renamed later', quantity: 2, unitPrice: 55.125, totalPrice: 110.25 }],
    })).toEqual({
      subtotalPaise: 11025,
      discountPaise: 1000,
      taxPaise: 501,
      deliveryChargePaise: 2000,
      totalPaise: 12526,
      inventoryState: 'unknown',
      couponState: 'unknown',
      orderStatus: 'preparing',
      items: [{
        name: 'Renamed later', quantity: 2, unitPrice: 55.125, totalPrice: 110.25,
        unitPricePaise: 5513, totalPricePaise: 11025, productName: 'Renamed later',
        variantId: 'unknown', variantName: 'Unknown legacy variant', categoryId: 'unknown',
        categoryName: 'Unknown', unitCostPaise: null,
      }],
    });
  });

  it('does not overwrite recorded snapshots or invent missing customer/payment data', () => {
    const patch = legacyOrderPatch({
      subtotalPaise: 1000, subtotal: 999,
      inventoryState: 'released', couponState: 'none',
      items: [{ name: 'Known', productName: 'Historical name', quantity: 1, unitPricePaise: 1000,
        totalPricePaise: 1000, unitCostPaise: null, variantId: 'v1', variantName: 'Large',
        categoryId: 'old-category-id', categoryName: 'Old category' }],
    });
    expect(patch).not.toHaveProperty('subtotalPaise');
    expect(patch).not.toHaveProperty('customerSnapshot');
    expect(patch).not.toHaveProperty('collectedPaise');
    expect(patch).not.toHaveProperty('refundedPaise');
    expect(patch).not.toHaveProperty('items');
  });

  it('normalizes catalog/coupon money without guessing costs', () => {
    expect(legacyMenuItemPatch({ category: 'South Indian', basePrice: 99.5, variants: [] }))
      .toEqual({ basePricePaise: 9950, categoryId: 'south-indian', costPaise: null });
    expect(legacyCouponPatch({ discountType: 'fixed', discountValue: 25, minOrderValue: 150 }))
      .toEqual({ minOrderPaise: 15000, fixedDiscountPaise: 2500, maxDiscountPaise: null });
  });
});
