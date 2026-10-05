export const REVIEW_ELIGIBLE_ORDER_STATUSES = ['served', 'delivered'] as const;

/**
 * Counter orders become review-eligible when served. `delivered` remains valid
 * for historical delivery records and is never rewritten.
 */
export function reviewOrderEligibilityFilter(input: {
  userId: string;
  orderId?: string | null;
  menuItemId?: string | null;
}): Record<string, unknown> {
  return {
    userId: input.userId,
    orderStatus: { $in: [...REVIEW_ELIGIBLE_ORDER_STATUSES] },
    ...(input.orderId ? { _id: input.orderId } : {}),
    ...(input.menuItemId ? { 'items.menuItemId': input.menuItemId } : {}),
  };
}
