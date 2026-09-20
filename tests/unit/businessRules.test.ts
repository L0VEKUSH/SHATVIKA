import { describe, expect, it } from 'vitest';
import {
  BusinessRulesConfigurationError,
  calculateOrderTotals,
  getBusinessRules,
  isPostalCodeServiceable,
} from '@/lib/businessRules';
import { quoteCustomerCart } from '@/lib/orders/cartQuote';

const configuredEnvironment = (): Record<string, string | undefined> => ({
  TAX_RATE_BASIS_POINTS: '500',
  DELIVERY_FEE_PAISE: '4000',
  FREE_DELIVERY_THRESHOLD_PAISE: '50000',
  SERVICEABLE_POSTAL_CODES: '110001, 110002',
  MAX_QUANTITY_PER_ITEM: '8',
  TARGET_PREPARATION_MINUTES: '25',
});

describe('checkout business rules', () => {
  it('fails closed and identifies missing owner-configured values', () => {
    expect(() => getBusinessRules({})).toThrow(BusinessRulesConfigurationError);
    try {
      getBusinessRules({});
    } catch (error) {
      expect((error as BusinessRulesConfigurationError).missing).toEqual(['TAX_RATE_BASIS_POINTS']);
    }
  });

  it('allows an empty persisted cart to load and clear while checkout configuration is unavailable', async () => {
    await expect(quoteCustomerCart({ userId: '507f1f77bcf86cd799439011', lines: [] })).resolves.toMatchObject({
      items: [],
      couponCode: null,
      totalPaise: 0,
    });
  });

  it('parses integer paise and matches postal codes exactly', () => {
    const rules = getBusinessRules(configuredEnvironment());
    expect(rules.taxRateBasisPoints).toBe(500);
    expect(rules.deliveryFeePaise).toBe(4000);
    expect(rules.maxQuantityPerItem).toBe(8);
    expect(isPostalCodeServiceable(' 110001 ', rules)).toBe(true);
    expect(isPostalCodeServiceable('110003', rules)).toBe(false);
  });

  it('supports an explicit wildcard service area', () => {
    const source = configuredEnvironment();
    source.SERVICEABLE_POSTAL_CODES = '*';
    expect(isPostalCodeServiceable('any-owner-approved-value', getBusinessRules(source))).toBe(true);
  });

  it('uses one integer-paise rounding policy for tax and delivery', () => {
    const rules = getBusinessRules(configuredEnvironment());
    expect(calculateOrderTotals(21_100, 1_250, rules)).toEqual({
      subtotalPaise: 21_100,
      discountPaise: 1_250,
      taxablePaise: 19_850,
      taxPaise: 993,
      deliveryChargePaise: 4_000,
      totalPaise: 24_843,
    });
    expect(calculateOrderTotals(50_000, 0, rules).deliveryChargePaise).toBe(0);
    expect(calculateOrderTotals(21_100, 1_250, rules, { fulfillmentType: 'counter' })).toEqual({
      subtotalPaise: 21_100,
      discountPaise: 1_250,
      taxablePaise: 19_850,
      taxPaise: 993,
      deliveryChargePaise: 0,
      totalPaise: 20_843,
    });
  });

  it.each([
    ['TAX_RATE_BASIS_POINTS', '10001'],
    ['DELIVERY_FEE_PAISE', '1.2'],
    ['MAX_QUANTITY_PER_ITEM', '0'],
    ['TARGET_PREPARATION_MINUTES', '1441'],
  ])('rejects invalid %s configuration', (name, value) => {
    const source = configuredEnvironment();
    source[name] = value;
    expect(() => getBusinessRules(source)).toThrow();
  });
});
