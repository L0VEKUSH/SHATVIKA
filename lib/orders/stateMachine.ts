export const ORDER_STATUSES = [
  'placed',
  'pending',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'served',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderActorType = 'customer' | 'guest' | 'admin' | 'worker' | 'system';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ['accepted', 'cancelled'],
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  served: [],
  cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function allowedOrderTransitions(status: OrderStatus, actor: OrderActorType): readonly OrderStatus[] {
  const allowed = TRANSITIONS[status];
  if (actor === 'customer' || actor === 'guest') {
    return allowed.filter((next) => next === 'cancelled' && ['placed', 'pending', 'accepted'].includes(status));
  }
  return allowed;
}

export function isFulfilledOrderStatus(status: unknown): status is 'served' | 'delivered' {
  return status === 'served' || status === 'delivered';
}

export function isActiveOrderStatus(status: unknown): status is OrderStatus {
  return isOrderStatus(status) && !['served', 'delivered', 'cancelled'].includes(status);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus, actor: OrderActorType): void {
  if (!allowedOrderTransitions(from, actor).includes(to)) {
    throw new OrderTransitionError(from, to, actor);
  }
}

export class OrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: OrderActorType,
  ) {
    super(`Order cannot transition from ${from} to ${to} for ${actor}`);
    this.name = 'OrderTransitionError';
  }
}
