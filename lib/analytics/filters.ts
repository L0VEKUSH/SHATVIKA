import { z } from 'zod';
import {
  DATE_PRESETS,
  GRANULARITIES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type AnalyticsFilterWire,
  type AnalyticsQuery,
  type ResolvedAnalyticsFilters,
} from './contracts';
import { chooseGranularity, DEFAULT_BUSINESS_TIME_ZONE, resolveRange } from './time';

const querySchema = z.object({
  preset: z.enum(DATE_PRESETS).default('30d'),
  from: z.string().optional(),
  to: z.string().optional(),
  group: z.enum(GRANULARITIES).optional(),
  statuses: z.array(z.enum(ORDER_STATUSES)).max(ORDER_STATUSES.length).default([]),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).default([]),
  paymentStatuses: z.array(z.enum(PAYMENT_STATUSES)).max(PAYMENT_STATUSES.length).default([]),
  productId: z.string().trim().min(1).max(80).optional(),
  variantId: z.string().trim().min(1).max(80).optional(),
  categoryId: z.string().trim().min(1).max(80).optional(),
  couponCode: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()).optional(),
  workerId: z.string().trim().min(1).max(80).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});

function list(params: URLSearchParams, singular: string, plural: string) {
  const values = [...params.getAll(singular), ...params.getAll(plural)]
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export function parseAnalyticsSearchParams(params: URLSearchParams): AnalyticsQuery {
  const parsed = querySchema.safeParse({
    preset: params.get('preset') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    group: params.get('group') ?? undefined,
    statuses: list(params, 'status', 'statuses'),
    paymentMethods: list(params, 'paymentMethod', 'paymentMethods'),
    paymentStatuses: list(params, 'paymentStatus', 'paymentStatuses'),
    productId: params.get('productId') ?? undefined,
    variantId: params.get('variantId') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    couponCode: params.get('couponCode') ?? undefined,
    workerId: params.get('workerId') ?? undefined,
    search: params.get('search') ?? undefined,
  });
  if (!parsed.success) throw new AnalyticsFilterError('INVALID_FILTERS', parsed.error.flatten());
  return parsed.data;
}

export function parseAnalyticsBody(value: unknown): AnalyticsQuery {
  const parsed = querySchema.safeParse(value);
  if (!parsed.success) throw new AnalyticsFilterError('INVALID_FILTERS', parsed.error.flatten());
  return parsed.data;
}

export function resolveAnalyticsFilters(
  query: AnalyticsQuery,
  options: { now?: Date; timeZone?: string } = {},
): ResolvedAnalyticsFilters {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? process.env.BUSINESS_TIME_ZONE ?? DEFAULT_BUSINESS_TIME_ZONE;
  const preset = query.preset ?? '30d';
  let range: ReturnType<typeof resolveRange>;
  try {
    range = resolveRange({ preset, from: query.from, to: query.to, now, timeZone });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_RANGE';
    throw new AnalyticsFilterError(code);
  }
  const group = chooseGranularity(range.fromUtc, range.toExclusiveUtc, query.group);
  return {
    preset,
    from: range.from,
    to: range.to,
    group,
    statuses: query.statuses ?? [],
    paymentMethods: query.paymentMethods ?? [],
    paymentStatuses: query.paymentStatuses ?? [],
    productId: query.productId,
    variantId: query.variantId,
    categoryId: query.categoryId,
    couponCode: query.couponCode,
    workerId: query.workerId,
    search: query.search,
    timeZone,
    fromUtc: range.fromUtc,
    toExclusiveUtc: range.toExclusiveUtc,
    comparisonFromUtc: range.comparisonFromUtc,
    comparisonToExclusiveUtc: range.comparisonToExclusiveUtc,
    asOfUtc: now,
  };
}

export function filtersToWire(filters: ResolvedAnalyticsFilters): AnalyticsFilterWire {
  return {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    group: filters.group,
    statuses: filters.statuses,
    paymentMethods: filters.paymentMethods,
    paymentStatuses: filters.paymentStatuses,
    productId: filters.productId,
    variantId: filters.variantId,
    categoryId: filters.categoryId,
    couponCode: filters.couponCode,
    workerId: filters.workerId,
    search: filters.search,
  };
}

export function filtersToSearchParams(filters: AnalyticsFilterWire) {
  const params = new URLSearchParams({
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    group: filters.group,
  });
  for (const value of filters.statuses) params.append('status', value);
  for (const value of filters.paymentMethods) params.append('paymentMethod', value);
  for (const value of filters.paymentStatuses) params.append('paymentStatus', value);
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.variantId) params.set('variantId', filters.variantId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.couponCode) params.set('couponCode', filters.couponCode);
  if (filters.workerId) params.set('workerId', filters.workerId);
  if (filters.search) params.set('search', filters.search);
  return params;
}

export class AnalyticsFilterError extends Error {
  constructor(public readonly code: string, public readonly details?: unknown) {
    super(code);
  }
}
