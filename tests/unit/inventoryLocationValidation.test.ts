import { describe, expect, it } from 'vitest';
import { availableQuantity, isOrderableInventory, resolveInventoryMode } from '@/lib/inventory';
import {
  canonicalLocationId,
  configuredCounterLocation,
  getCounterLocationConfiguration,
} from '@/lib/locations';
import { operationalReasonSchema } from '@/lib/validation';

describe('canonical counter location, inventory, and reason contracts', () => {
  it('uses one canonical configured location and rejects unknown assignments', () => {
    const source = { COUNTER_LOCATION_ID: ' Shatvika-Corner ', COUNTER_LOCATION_NAME: 'Main counter' };
    expect(canonicalLocationId(' SHATVIKA-CORNER ')).toBe('shatvika-corner');
    expect(getCounterLocationConfiguration(source)).toMatchObject({
      location: { id: 'shatvika-corner', name: 'Main counter' },
      explicit: true,
      warning: null,
    });
    expect(configuredCounterLocation('SHATVIKA-CORNER', source)?.id).toBe('shatvika-corner');
    expect(configuredCounterLocation('nonexistent', source)).toBeNull();
  });

  it('labels an omitted location configuration instead of hiding the fallback', () => {
    const result = getCounterLocationConfiguration({});
    expect(result.location.id).toBe('shatvika-corner');
    expect(result.explicit).toBe(false);
    expect(result.warning).toContain('not explicitly configured');
  });

  it('does not turn missing legacy inventory into a false zero-stock assertion', () => {
    expect(resolveInventoryMode({})).toBe('unconfigured');
    expect(availableQuantity({})).toBeNull();
    expect(isOrderableInventory({})).toBe(false);
    expect(resolveInventoryMode({ quantity: 0 })).toBe('tracked');
    expect(isOrderableInventory({ inventoryMode: 'unlimited' }, 1_000)).toBe(true);
    expect(isOrderableInventory({ inventoryMode: 'tracked', quantity: 2 }, 3)).toBe(false);
  });

  it('returns explicit reason-field messages for wrong types and invalid lengths', () => {
    expect(operationalReasonSchema.safeParse(null).error?.issues[0]?.message).toBe('Reason must be text.');
    expect(operationalReasonSchema.safeParse('x').error?.issues[0]?.message).toContain('at least 3');
    expect(operationalReasonSchema.safeParse(' valid reason ').data).toBe('valid reason');
  });
});
