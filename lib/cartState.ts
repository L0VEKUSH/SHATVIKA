import type { CartItem, MenuItem, Variant } from '@/types';

function boundedQuantity(value: number): number {
  if (!Number.isSafeInteger(value)) return 1;
  return Math.min(100, Math.max(1, value));
}

/** Add a catalogue line without losing the quantity selected by the customer. */
export function addCartItem(
  current: readonly CartItem[],
  item: MenuItem,
  variant: Variant,
  requestedQuantity = 1,
): CartItem[] {
  const quantity = boundedQuantity(requestedQuantity);
  const inventoryMode = item.inventoryMode;
  const availableQuantity = inventoryMode === 'tracked' && Number.isSafeInteger(item.quantity)
    ? Math.max(0, Number(item.quantity))
    : null;
  const cartItemId = `${item.id}-${variant.id}`;
  const existing = current.find((entry) => entry.id === cartItemId);
  if (existing) {
    const otherVariantQuantity = current
      .filter((entry) => entry.menuItemId === item.id && entry.id !== cartItemId)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const productLimit = availableQuantity == null ? 100 : Math.max(0, availableQuantity - otherVariantQuantity);
    return current.map((entry) => entry.id === cartItemId
      ? { ...entry, inventoryMode, availableQuantity, quantity: Math.min(100, productLimit, entry.quantity + quantity) }
      : entry);
  }
  const alreadyInCart = current
    .filter((entry) => entry.menuItemId === item.id)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const productLimit = availableQuantity == null ? 100 : Math.max(0, availableQuantity - alreadyInCart);
  if (productLimit < 1) return [...current];
  return [...current, {
    id: cartItemId,
    menuItemId: item.id,
    menuItemName: item.name,
    variantId: variant.id,
    variantName: variant.name,
    variantPrice: variant.price,
    quantity: Math.min(quantity, productLimit),
    inventoryMode,
    availableQuantity,
    emoji: item.emoji,
    gradientClass: item.gradientClass,
  }];
}
