export const INVENTORY_MODES = ['tracked', 'unlimited'] as const;
export type InventoryMode = typeof INVENTORY_MODES[number];
export type ResolvedInventoryMode = InventoryMode | 'unconfigured';

export type InventoryProduct = {
  inventoryMode?: unknown;
  quantity?: unknown;
};

/** Legacy numeric quantities remain tracked; missing mode and quantity is intentionally unresolved. */
export function resolveInventoryMode(product: InventoryProduct): ResolvedInventoryMode {
  if (product.inventoryMode === 'tracked' || product.inventoryMode === 'unlimited') {
    return product.inventoryMode;
  }
  return Number.isSafeInteger(product.quantity) && Number(product.quantity) >= 0
    ? 'tracked'
    : 'unconfigured';
}

export function availableQuantity(product: InventoryProduct): number | null {
  if (resolveInventoryMode(product) !== 'tracked') return null;
  const value = Number(product.quantity);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function isOrderableInventory(product: InventoryProduct, requested = 1): boolean {
  const mode = resolveInventoryMode(product);
  if (mode === 'unlimited') return true;
  if (mode === 'unconfigured') return false;
  return (availableQuantity(product) ?? 0) >= requested;
}
