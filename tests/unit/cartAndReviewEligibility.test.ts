import { describe, expect, it } from 'vitest';
import { addCartItem } from '@/lib/cartState';
import {
  REVIEW_ELIGIBLE_ORDER_STATUSES,
  reviewOrderEligibilityFilter,
} from '@/lib/reviews/eligibility';
import type { MenuItem, Variant } from '@/types';

const item: MenuItem = {
  id: '507f1f77bcf86cd799439011',
  name: 'Counter Momos',
  description: '',
  variants: [],
  rating: 0,
  reviewCount: 0,
  category: 'Momos',
  emoji: 'M',
  gradientClass: 'from-orange-500 to-red-500',
};
const variant: Variant = { id: 'base', name: 'Regular', price: 80, available: true };

describe('cart quantity and counter review eligibility', () => {
  it('preserves the selected quantity and safely combines an existing line', () => {
    const first = addCartItem([], item, variant, 4);
    expect(first).toHaveLength(1);
    expect(first[0].quantity).toBe(4);
    expect(addCartItem(first, item, variant, 3)[0].quantity).toBe(7);
    expect(addCartItem(first, item, variant, 500)[0].quantity).toBe(100);
  });

  it('caps all variants at shared tracked stock without imposing a fake limit on unlimited items', () => {
    const tracked = { ...item, inventoryMode: 'tracked' as const, quantity: 5 };
    const first = addCartItem([], tracked, { ...variant, id: 'small' }, 4);
    const second = addCartItem(first, tracked, { ...variant, id: 'large' }, 4);
    expect(second.map(line => line.quantity)).toEqual([4, 1]);
    const unlimited = addCartItem([], { ...item, inventoryMode: 'unlimited' as const }, variant, 10);
    expect(unlimited[0]).toMatchObject({ quantity: 10, inventoryMode: 'unlimited', availableQuantity: null });
  });

  it('allows reviews for served counter orders and historical delivered orders', () => {
    expect(REVIEW_ELIGIBLE_ORDER_STATUSES).toEqual(['served', 'delivered']);
    expect(reviewOrderEligibilityFilter({
      userId: '507f1f77bcf86cd799439012',
      orderId: '507f1f77bcf86cd799439013',
      menuItemId: item.id,
    })).toEqual({
      userId: '507f1f77bcf86cd799439012',
      orderStatus: { $in: ['served', 'delivered'] },
      _id: '507f1f77bcf86cd799439013',
      'items.menuItemId': item.id,
    });
  });
});
