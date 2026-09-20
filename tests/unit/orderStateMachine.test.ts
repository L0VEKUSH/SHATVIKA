import { describe, expect, it } from 'vitest';
import {
  allowedOrderTransitions,
  assertOrderTransition,
  isOrderStatus,
  ORDER_STATUSES,
  OrderTransitionError,
} from '@/lib/orders/stateMachine';

describe('shared order state machine', () => {
  it('uses one canonical status vocabulary', () => {
    expect(ORDER_STATUSES).toContain('preparing');
    expect(ORDER_STATUSES).toContain('placed');
    expect(ORDER_STATUSES).toContain('served');
    expect(ORDER_STATUSES).not.toContain('cooking');
    expect(isOrderStatus('out_for_delivery')).toBe(true);
    expect(isOrderStatus('Cooking')).toBe(false);
  });

  it('keeps accepted, ready, and delivery stages distinct', () => {
    expect(allowedOrderTransitions('pending', 'admin')).toEqual(['accepted', 'cancelled']);
    expect(allowedOrderTransitions('accepted', 'admin')).toEqual(['preparing', 'cancelled']);
    expect(allowedOrderTransitions('preparing', 'admin')).toEqual(['ready', 'cancelled']);
    expect(allowedOrderTransitions('ready', 'admin')).toEqual(['served', 'out_for_delivery', 'cancelled']);
  });

  it('limits customer cancellation to placed, pending, or accepted orders', () => {
    expect(allowedOrderTransitions('placed', 'customer')).toEqual(['cancelled']);
    expect(allowedOrderTransitions('pending', 'customer')).toEqual(['cancelled']);
    expect(allowedOrderTransitions('accepted', 'customer')).toEqual(['cancelled']);
    expect(allowedOrderTransitions('preparing', 'customer')).toEqual([]);
  });

  it('rejects skipped, reversed, and terminal transitions', () => {
    for (const [from, to] of [
      ['pending', 'delivered'],
      ['ready', 'preparing'],
      ['delivered', 'cancelled'],
      ['cancelled', 'pending'],
    ] as const) {
      expect(() => assertOrderTransition(from, to, 'admin')).toThrow(OrderTransitionError);
    }
  });
});
