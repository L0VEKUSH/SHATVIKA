import { z } from 'zod';
import { assertPaise, percentageOfPaise } from '@/lib/money';
import { getCounterLocationConfiguration } from '@/lib/locations';

export interface BusinessRules {
  taxRateBasisPoints: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  serviceablePostalCodes: Set<string> | '*';
  maxQuantityPerItem: number;
  targetDeliveryMinutes: number;
  targetPreparationMinutes: number;
}

export const COUNTER_FULFILLMENT_TYPE = 'counter' as const;

export type FulfillmentCapabilities = {
  counterCollectionEnabled: true;
  deliveryEnabled: false;
  locationId: string;
  locationName: string;
  tokenPrefix: string;
  timeZone: string;
};

export class BusinessRulesConfigurationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Checkout business rules are not configured: ${missing.join(', ')}`);
    this.name = 'BusinessRulesConfigurationError';
    this.missing = missing;
  }
}

const integer = z.coerce.number().int().nonnegative();

export function getBusinessRules(source: Record<string, string | undefined> = process.env): BusinessRules {
  const required = ['TAX_RATE_BASIS_POINTS'] as const;
  const missing = required.filter((name) => source[name] === undefined || source[name]?.trim() === '');
  if (missing.length) throw new BusinessRulesConfigurationError([...missing]);

  const taxRateBasisPoints = integer.max(10000).parse(source.TAX_RATE_BASIS_POINTS);
  const deliveryFeePaise = integer.parse(source.DELIVERY_FEE_PAISE ?? '0');
  const freeDeliveryThresholdPaise = integer.parse(source.FREE_DELIVERY_THRESHOLD_PAISE ?? '0');
  const maxQuantityPerItem = integer.min(1).max(100).parse(source.MAX_QUANTITY_PER_ITEM ?? '10');
  const targetDeliveryMinutes = integer.min(1).max(1440).parse(source.TARGET_DELIVERY_MINUTES ?? '45');
  const targetPreparationMinutes = integer.min(1).max(240).parse(source.TARGET_PREPARATION_MINUTES ?? '20');

  const rawPostalCodes = String(source.SERVICEABLE_POSTAL_CODES ?? '*').trim();
  const serviceablePostalCodes = rawPostalCodes === '*'
    ? '*'
    : new Set(rawPostalCodes.split(',').map((value) => value.trim()).filter(Boolean));
  if (serviceablePostalCodes !== '*' && serviceablePostalCodes.size === 0) {
    throw new BusinessRulesConfigurationError(['SERVICEABLE_POSTAL_CODES']);
  }

  return {
    taxRateBasisPoints,
    deliveryFeePaise,
    freeDeliveryThresholdPaise,
    serviceablePostalCodes,
    maxQuantityPerItem,
    targetDeliveryMinutes,
    targetPreparationMinutes,
  };
}

export function getFulfillmentCapabilities(
  source: Record<string, string | undefined> = process.env,
): FulfillmentCapabilities {
  const timeZone = source.BUSINESS_TIME_ZONE?.trim() || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone }).format(new Date(0));
  } catch {
    throw new BusinessRulesConfigurationError(['BUSINESS_TIME_ZONE']);
  }
  const tokenPrefix = (source.COUNTER_TOKEN_PREFIX?.trim().toUpperCase() || 'SC')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'SC';
  const { location } = getCounterLocationConfiguration(source);
  return {
    counterCollectionEnabled: true,
    // This release intentionally has no delivery-capable server path. The flag is
    // returned explicitly so clients cannot mistake missing configuration for availability.
    deliveryEnabled: false,
    locationId: location.id,
    locationName: location.name,
    tokenPrefix,
    timeZone,
  };
}

export function isPostalCodeServiceable(postalCode: string, rules: BusinessRules): boolean {
  if (rules.serviceablePostalCodes === '*') return true;
  return rules.serviceablePostalCodes.has(postalCode.trim());
}

/** Shared invoice rounding policy used by checkout and server-side cart quotes. */
export function calculateOrderTotals(
  subtotalPaise: number,
  discountPaise: number,
  rules: BusinessRules,
  options: { fulfillmentType?: 'delivery' | 'counter' } = {},
) {
  assertPaise(subtotalPaise, 'subtotal');
  assertPaise(discountPaise, 'discount');
  const appliedDiscountPaise = Math.min(subtotalPaise, discountPaise);
  const taxablePaise = subtotalPaise - appliedDiscountPaise;
  const taxPaise = percentageOfPaise(taxablePaise, rules.taxRateBasisPoints);
  const deliveryChargePaise = options.fulfillmentType === 'counter'
    ? 0
    : taxablePaise >= rules.freeDeliveryThresholdPaise
    ? 0
    : rules.deliveryFeePaise;
  return {
    subtotalPaise,
    discountPaise: appliedDiscountPaise,
    taxablePaise,
    taxPaise,
    deliveryChargePaise,
    totalPaise: taxablePaise + taxPaise + deliveryChargePaise,
  };
}
