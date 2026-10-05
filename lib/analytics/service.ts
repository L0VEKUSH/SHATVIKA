import mongoose from 'mongoose';
import { ContactMessage } from '@/models/ContactMessage';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { Coupon } from '@/models/Coupon';
import { Expense } from '@/models/Expense';
import { ExpensePeriod } from '@/models/ExpensePeriod';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';
import { Order } from '@/models/Order';
import { Review } from '@/models/Review';
import { User } from '@/models/User';
import { resolveInventoryMode, type ResolvedInventoryMode } from '@/lib/inventory';
import {
  type AnalyticsSnapshot,
  type CouponAnalyticsRow,
  type CustomerAnalyticsRow,
  type GrowthAction,
  type InventoryAnalyticsRow,
  type InventoryEventAnalyticsRow,
  type MetricUnit,
  type MetricValue,
  type OperationAnalyticsRow,
  type OrderAnalyticsRow,
  type PaymentAnalyticsRow,
  type ProductAnalyticsRow,
  type SoldItemAnalyticsRow,
  type ExpenseAnalyticsRow,
  type ResolvedAnalyticsFilters,
  type ReviewAnalyticsRow,
  type TrendPoint,
} from './contracts';
import { filtersToWire } from './filters';
import { METRIC_DEFINITIONS_VERSION, METRIC_DICTIONARY } from './metricDictionary';
import {
  bucketKey,
  buildBuckets,
  businessHour,
  businessWeekday,
  formatBusinessDate,
  formatBusinessDateTime,
} from './time';

const MAX_ANALYTICS_ORDERS = 20_000;
const MAX_SUPPORTING_ROWS = 10_000;
const SUCCESSFUL_PAYMENT_STATUSES = new Set(['succeeded', 'paid', 'completed', 'success']);
const COLLECTION_EVENT_TYPES = new Set([
  'payment',
  'collection',
  'payment_collected',
  'cash_collected',
  'payment_captured',
  'capture',
]);
const REFUND_EVENT_TYPES = new Set(['refund', 'refunded', 'refund_succeeded']);
const ACTIVE_ORDER_STATUSES = ['placed', 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
const FULFILLED_ORDER_STATUSES = new Set(['served', 'delivered']);

type PlainRecord = Record<string, unknown>;

interface NormalizedItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  categoryId: string;
  categoryName: string;
  categoryWasSnapshotted: boolean;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  unitCostPaise: number | null;
}

interface NormalizedOrder {
  id: string;
  tokenNumber: string;
  tokenBusinessDate: string;
  fulfillmentType: 'counter' | 'delivery';
  fulfillmentLocation: string;
  userId: string;
  guestSessionId: string;
  customerIdentityType: 'guest' | 'google' | 'registered' | 'legacy';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerWasSnapshotted: boolean;
  items: NormalizedItem[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  explicitCollectedPaise: number | null;
  explicitRefundedPaise: number | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  couponCode: string;
  createdAt: Date;
  estimatedDeliveryTime: Date | null;
  estimatedReadyTime: Date | null;
  actualDeliveryTime: Date | null;
  servedAt: Date | null;
  servingWorker: string;
  servingWorkerId: string;
  statusHistory: Array<{
    fromStatus: string;
    status: string;
    timestamp: Date;
    actorType: string;
    reason: string;
    note: string;
  }>;
}

interface NormalizedProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  inventoryMode: ResolvedInventoryMode;
  reorderPoint: number;
  available: boolean;
  variants: Array<{ id: string; name: string }>;
}

interface NormalizedPayment {
  orderId: string;
  occurredAt: Date;
  type: string;
  status: string;
  method: string;
  amountPaise: number;
  recordedByType: string;
  recordedById: string;
  recordedByName: string;
  transactionReference: string;
}

interface ServiceInput {
  filters: ResolvedAnalyticsFilters;
  rawOrders: PlainRecord[];
  rawActiveOrders: PlainRecord[];
  rawProducts: PlainRecord[];
  rawUsers: PlainRecord[];
  rawReviews: PlainRecord[];
  rawContacts: PlainRecord[];
  rawCoupons: PlainRecord[];
  rawPayments: PlainRecord[];
  paymentCollectionExists: boolean;
  priorCustomerIds: Set<string>;
  priorComparisonCustomerIds?: Set<string>;
  lifetimeCustomers: Map<string, { count: number; firstOrderAt: Date | null }>;
  rawExpenses?: PlainRecord[];
  rawExpensePeriods?: PlainRecord[];
  rawInventoryEvents?: PlainRecord[];
}

function record(value: unknown): PlainRecord {
  return value && typeof value === 'object' ? value as PlainRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value: unknown, fallback = 0) {
  const number = finite(value);
  return number == null ? fallback : Math.round(number);
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function id(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') return value.toString();
  return String(value);
}

function slug(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return normalized || 'unknown';
}

function moneyPaise(source: PlainRecord, paiseKey: string, legacyKey: string) {
  const paise = finite(source[paiseKey]);
  if (paise != null) return Math.round(paise);
  const legacy = finite(source[legacyKey]);
  return legacy == null ? 0 : Math.round(legacy * 100);
}

function nullablePaise(source: PlainRecord, key: string) {
  const value = finite(source[key]);
  return value == null ? null : Math.max(0, Math.round(value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : null;
}

function metric(
  value: number | null,
  previous: number | null,
  unit: MetricUnit,
  definitionId: string,
  extras: Pick<MetricValue, 'coveragePct' | 'note'> = {},
): MetricValue {
  if (value == null) {
    return { value: null, previous, unit, definitionId, changePct: null, comparison: 'no-comparison', ...extras };
  }
  if (previous == null || previous === 0) {
    return {
      value,
      previous,
      unit,
      definitionId,
      changePct: null,
      comparison: previous === 0 && value > 0 ? 'new' : 'no-comparison',
      ...extras,
    };
  }
  return {
    value,
    previous,
    unit,
    definitionId,
    changePct: Math.round(((value - previous) / previous) * 1000) / 10,
    comparison: 'percent',
    ...extras,
  };
}

function normalizeProduct(raw: PlainRecord): NormalizedProduct {
  const categoryName = text(raw.category, 'Unknown historical category');
  const categoryId = text(raw.categoryId, slug(categoryName));
  return {
    id: id(raw._id ?? raw.id),
    name: text(raw.name, 'Unknown product'),
    categoryId,
    categoryName,
    quantity: Math.max(0, integer(raw.quantity)),
    inventoryMode: resolveInventoryMode({ inventoryMode: raw.inventoryMode, quantity: raw.quantity }),
    reorderPoint: Math.max(0, integer(raw.reorderPoint, 5)),
    available: raw.available !== false,
    variants: array(raw.variants).map(value => {
      const variant = record(value);
      return { id: text(variant.id), name: text(variant.name, 'Standard') };
    }),
  };
}

function normalizeOrder(
  raw: PlainRecord,
  users: Map<string, PlainRecord>,
): NormalizedOrder | null {
  const createdAt = date(raw.createdAt);
  if (!createdAt) return null;
  const userId = id(raw.userId) || id(raw.claimedByUserId);
  const guestSessionId = id(raw.guestSessionId);
  const customerIdentityType = raw.customerIdentityType === 'guest'
    || raw.customerIdentityType === 'google'
    || raw.customerIdentityType === 'registered'
    ? raw.customerIdentityType
    : 'legacy';
  const currentUser = users.get(userId) ?? {};
  const customerSnapshot = record(raw.customerSnapshot);
  const deliveryAddress = record(raw.deliveryAddress);
  const couponSnapshot = record(raw.couponSnapshot);

  const items = array(raw.items).map(value => {
    const item = record(value);
    const productId = id(item.menuItemId ?? item.productId);
    const snapshottedCategoryName = text(item.categoryName);
    const snapshottedCategoryId = text(item.categoryId);
    const categoryWasSnapshotted = Boolean(snapshottedCategoryName || snapshottedCategoryId);
    // Never rewrite historical categories from the current catalog: renamed or deleted
    // catalog data must remain an explicit unknown when an order-time snapshot is absent.
    const categoryName = snapshottedCategoryName || 'Unknown historical category';
    const categoryId = snapshottedCategoryId || 'unknown';
    const quantity = Math.max(0, integer(item.quantity ?? item.qty));
    const unitPricePaise = moneyPaise(item, 'unitPricePaise', 'unitPrice');
    const totalPricePaise = finite(item.totalPricePaise) != null
      ? Math.round(finite(item.totalPricePaise) as number)
      : finite(item.totalPrice) != null
        ? Math.round((finite(item.totalPrice) as number) * 100)
        : unitPricePaise * quantity;
    return {
      productId: productId || 'unknown',
      productName: text(item.productName ?? item.name, 'Unknown historical product'),
      variantId: text(item.variantId, 'standard'),
      variantName: text(item.variantName, 'Standard'),
      categoryId,
      categoryName,
      categoryWasSnapshotted,
      quantity,
      unitPricePaise,
      totalPricePaise,
      unitCostPaise: nullablePaise(item, 'unitCostPaise'),
    };
  });

  const history = array(raw.statusHistory).map(value => {
    const entry = record(value);
    const timestamp = date(entry.timestamp ?? entry.createdAt);
    if (!timestamp) return null;
    return {
      fromStatus: text(entry.fromStatus),
      status: text(entry.status),
      timestamp,
      actorType: text(entry.actorType, 'unknown'),
      reason: text(entry.reason),
      note: text(entry.note),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    id: id(raw._id ?? raw.id),
    tokenNumber: text(raw.tokenNumber),
    tokenBusinessDate: text(raw.tokenBusinessDate),
    fulfillmentType: raw.fulfillmentType === 'counter' ? 'counter' : 'delivery',
    fulfillmentLocation: text(raw.fulfillmentLocationName, raw.fulfillmentType === 'counter' ? 'Shatvika Corner' : 'Legacy delivery'),
    userId,
    guestSessionId,
    customerIdentityType,
    customerName: text(customerSnapshot.name, text(currentUser.fullName, customerIdentityType === 'guest' ? 'Guest' : 'Unknown customer')),
    customerEmail: text(customerSnapshot.email, text(currentUser.email)),
    customerPhone: text(customerSnapshot.phone, text(currentUser.phone ?? deliveryAddress.phone)),
    customerWasSnapshotted: Boolean(customerSnapshot.name || customerSnapshot.email || customerSnapshot.phone),
    items,
    subtotalPaise: moneyPaise(raw, 'subtotalPaise', 'subtotal'),
    discountPaise: moneyPaise(raw, 'discountPaise', 'discount'),
    taxPaise: moneyPaise(raw, 'taxPaise', 'tax'),
    deliveryPaise: moneyPaise(raw, 'deliveryChargePaise', 'deliveryCharge'),
    totalPaise: moneyPaise(raw, 'totalPaise', 'totalAmount'),
    explicitCollectedPaise: nullablePaise(raw, 'collectedPaise'),
    explicitRefundedPaise: nullablePaise(raw, 'refundedPaise'),
    paymentMethod: text(raw.paymentMethod, 'unknown'),
    paymentStatus: text(raw.paymentStatus, 'unknown'),
    status: text(raw.orderStatus ?? raw.status, 'unknown'),
    couponCode: text(couponSnapshot.code, text(raw.couponCode)).toUpperCase(),
    createdAt,
    estimatedDeliveryTime: date(raw.estimatedDeliveryTime),
    estimatedReadyTime: date(raw.estimatedReadyTime),
    actualDeliveryTime: date(raw.actualDeliveryTime),
    servedAt: date(raw.servedAt),
    servingWorker: text(raw.servedByName),
    servingWorkerId: text(raw.servedById),
    statusHistory: history,
  };
}

function normalizePayment(raw: PlainRecord): NormalizedPayment | null {
  const occurredAt = date(raw.occurredAt ?? raw.createdAt);
  const amountPaise = finite(raw.amountPaise);
  if (!occurredAt || amountPaise == null) return null;
  return {
    orderId: id(raw.orderId),
    occurredAt,
    type: text(raw.type).toLowerCase(),
    status: text(raw.status).toLowerCase(),
    method: text(raw.method, 'unknown'),
    amountPaise: Math.max(0, Math.round(amountPaise)),
    recordedByType: text(raw.recordedByType),
    recordedById: text(raw.recordedById),
    recordedByName: text(raw.recordedByName),
    transactionReference: text(raw.transactionReference),
  };
}

function isSuccessfulPayment(payment: NormalizedPayment) {
  return SUCCESSFUL_PAYMENT_STATUSES.has(payment.status);
}

function isCollection(payment: NormalizedPayment) {
  return isSuccessfulPayment(payment) && COLLECTION_EVENT_TYPES.has(payment.type);
}

function isRefund(payment: NormalizedPayment) {
  return isSuccessfulPayment(payment) && REFUND_EVENT_TYPES.has(payment.type);
}

function stockStatus(product: NormalizedProduct): ProductAnalyticsRow['stockStatus'] {
  if (!product.available) return 'manually_disabled';
  if (product.inventoryMode === 'unlimited') return 'unlimited';
  if (product.inventoryMode === 'unconfigured') return 'unconfigured';
  if (product.quantity === 0) return 'out_of_stock';
  if (product.quantity <= product.reorderPoint) return 'low_stock';
  return 'in_stock';
}

function orderMatches(order: NormalizedOrder, filters: ResolvedAnalyticsFilters) {
  if (filters.statuses.length && !filters.statuses.includes(order.status as never)) return false;
  if (filters.paymentMethods.length && !filters.paymentMethods.includes(order.paymentMethod as never)) return false;
  if (filters.paymentStatuses.length && !filters.paymentStatuses.includes(order.paymentStatus as never)) return false;
  if (filters.couponCode && order.couponCode !== filters.couponCode) return false;
  if (filters.productId && !order.items.some(item => item.productId === filters.productId)) return false;
  if (filters.variantId && !order.items.some(item => item.variantId === filters.variantId)) return false;
  if (filters.categoryId && !order.items.some(item => item.categoryId === filters.categoryId)) return false;
  if (filters.workerId && order.servingWorkerId !== filters.workerId) return false;
  if (filters.search) {
    const search = filters.search.toLowerCase();
    if (!order.id.toLowerCase().includes(search) && !order.tokenNumber.toLowerCase().includes(search)) return false;
  }
  return true;
}

function periodOrders(orders: NormalizedOrder[], from: Date, to: Date) {
  return orders.filter(order => order.createdAt >= from && order.createdAt < to);
}

function financials(orders: NormalizedOrder[]) {
  // `delivered` remains the internal property name for backwards-compatible
  // consumers, but includes legacy delivered orders and new counter served orders.
  const delivered = orders.filter(order => FULFILLED_ORDER_STATUSES.has(order.status));
  return {
    delivered,
    merchandise: delivered.reduce((sum, order) => sum + order.subtotalPaise, 0),
    discount: delivered.reduce((sum, order) => sum + order.discountPaise, 0),
    tax: delivered.reduce((sum, order) => sum + order.taxPaise, 0),
    delivery: delivered.reduce((sum, order) => sum + order.deliveryPaise, 0),
    invoice: delivered.reduce((sum, order) => sum + order.totalPaise, 0),
  };
}

function allocateOrderDiscount(order: NormalizedOrder) {
  const lineTotal = order.items.reduce((sum, item) => sum + item.totalPricePaise, 0);
  const discount = Math.min(Math.max(0, order.discountPaise), lineTotal);
  let remaining = discount;
  return order.items.map((item, index) => {
    if (index === order.items.length - 1) return remaining;
    const allocated = lineTotal > 0 ? Math.floor(discount * item.totalPricePaise / lineTotal) : 0;
    remaining -= allocated;
    return allocated;
  });
}

function allocateIntegerByWeights(amount: number, weights: number[]) {
  const totalWeight = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  let remaining = Math.max(0, Math.round(amount));
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return remaining;
    const allocated = totalWeight > 0 ? Math.floor(amount * Math.max(0, weight) / totalWeight) : 0;
    remaining -= allocated;
    return allocated;
  });
}

function eventTotals(payments: NormalizedPayment[], from: Date, to: Date) {
  const inPeriod = payments.filter(payment => payment.occurredAt >= from && payment.occurredAt < to);
  return {
    collected: inPeriod.filter(isCollection).reduce((sum, payment) => sum + payment.amountPaise, 0),
    refunded: inPeriod.filter(isRefund).reduce((sum, payment) => sum + payment.amountPaise, 0),
  };
}

function buildTrend(orders: NormalizedOrder[], payments: NormalizedPayment[], filters: ResolvedAnalyticsFilters, paymentMode: AnalyticsSnapshot['dataQuality']['paymentTracking']) {
  const base = new Map<string, TrendPoint>();
  for (const bucket of buildBuckets(filters.fromUtc, filters.toExclusiveUtc, filters.group, filters.timeZone)) {
    base.set(bucket.key, {
      key: bucket.key,
      label: bucket.label,
      orders: 0,
      deliveredOrders: 0,
      merchandiseSalesPaise: 0,
      discountsPaise: 0,
      taxPaise: 0,
      deliveryPaise: 0,
      invoiceTotalPaise: 0,
      collectedPaise: paymentMode === 'unavailable' ? null : 0,
      refundedPaise: paymentMode === 'unavailable' ? null : 0,
    });
  }
  for (const order of orders) {
    const point = base.get(bucketKey(order.createdAt, filters.group, filters.timeZone));
    if (!point) continue;
    point.orders += 1;
    if (FULFILLED_ORDER_STATUSES.has(order.status)) {
      point.deliveredOrders += 1;
      point.merchandiseSalesPaise += order.subtotalPaise;
      point.discountsPaise += order.discountPaise;
      point.taxPaise += order.taxPaise;
      point.deliveryPaise += order.deliveryPaise;
      point.invoiceTotalPaise += order.totalPaise;
      if (paymentMode === 'order-totals') {
        point.collectedPaise = (point.collectedPaise ?? 0) + (order.explicitCollectedPaise ?? 0);
        point.refundedPaise = (point.refundedPaise ?? 0) + (order.explicitRefundedPaise ?? 0);
      }
    }
  }
  if (paymentMode === 'events') {
    for (const payment of payments) {
      if (payment.occurredAt < filters.fromUtc || payment.occurredAt >= filters.toExclusiveUtc) continue;
      const point = base.get(bucketKey(payment.occurredAt, filters.group, filters.timeZone));
      if (!point) continue;
      if (isCollection(payment)) point.collectedPaise = (point.collectedPaise ?? 0) + payment.amountPaise;
      if (isRefund(payment)) point.refundedPaise = (point.refundedPaise ?? 0) + payment.amountPaise;
    }
  }
  return [...base.values()];
}

function firstHistory(order: NormalizedOrder, statuses: string[]) {
  return order.statusHistory.find(entry => statuses.includes(entry.status))?.timestamp ?? null;
}

function minutesBetween(start: Date | null, end: Date | null) {
  if (!start || !end || end < start) return null;
  return Math.round(((end.getTime() - start.getTime()) / 60_000) * 10) / 10;
}

function operationRow(order: NormalizedOrder, asOf: Date): OperationAnalyticsRow {
  const preparationStart = firstHistory(order, ['accepted', 'preparing']);
  const readyAt = firstHistory(order, ['ready']);
  const deliveryStart = firstHistory(order, ['out_for_delivery']) ?? readyAt;
  const deliveredAt = order.actualDeliveryTime ?? firstHistory(order, ['delivered']);
  const servedAt = order.servedAt ?? firstHistory(order, ['served']);
  const fulfilledAt = order.fulfillmentType === 'counter' ? servedAt : deliveredAt;
  const cancellation = order.statusHistory.find(entry => entry.status === 'cancelled');
  const active = ACTIVE_ORDER_STATUSES.includes(order.status);
  const promisedAt = order.fulfillmentType === 'counter' ? order.estimatedReadyTime : order.estimatedDeliveryTime;
  return {
    orderId: order.id,
    tokenNumber: order.tokenNumber,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    placedAt: order.createdAt.toISOString(),
    promisedAt: promisedAt?.toISOString() ?? null,
    deliveredAt: deliveredAt?.toISOString() ?? null,
    servedAt: servedAt?.toISOString() ?? null,
    preparationMinutes: minutesBetween(preparationStart, readyAt),
    deliveryMinutes: minutesBetween(deliveryStart, deliveredAt),
    readyToServedMinutes: minutesBetween(readyAt, servedAt),
    totalFulfilmentMinutes: minutesBetween(order.createdAt, fulfilledAt),
    cancellationReason: cancellation?.reason || cancellation?.note || (order.status === 'cancelled' ? 'Reason not recorded' : ''),
    servingWorker: order.servingWorker,
    overdue: active && Boolean(promisedAt && promisedAt < asOf),
  };
}

function buildGrowthActions(args: {
  orders: NormalizedOrder[];
  inventoryAlerts: InventoryAnalyticsRow[];
  repeatRate: number | null;
  averageRating: number | null;
  reviewCount: number;
  costCoveragePct: number;
  periodLabel: string;
  peakHour?: { hour: number; orders: number };
  profitableItem?: ProductAnalyticsRow;
  popularCombination?: { productNames: string[]; orders: number };
  averagePreparationMinutes: number | null;
  preparationSamples: number;
  targetPreparationMinutes: number;
  itemTrend?: { productName: string; currentPaise: number; previousPaise: number; changePct: number };
}) {
  const actions: GrowthAction[] = [];
  const cancellationCount = args.orders.filter(order => order.status === 'cancelled').length;
  const cancellationRate = args.orders.length ? cancellationCount / args.orders.length * 100 : 0;
  if (args.orders.length >= 10 && cancellationRate >= 10) {
    actions.push({
      id: 'reduce-cancellations', priority: 'high', title: 'Review cancellation causes', period: args.periodLabel,
      evidence: `${cancellationCount} of ${args.orders.length} orders (${cancellationRate.toFixed(1)}%) are currently cancelled.`,
      suggestedAction: 'Record structured cancellation reasons and review the largest controllable category with the operations team.',
      confidence: 'medium', limitation: 'Legacy orders often lack a structured cancellation reason.', metricToMonitor: 'Cancellation rate and reason mix',
    });
  }
  if (args.inventoryAlerts.length) {
    actions.push({
      id: 'replenish-stock', priority: 'high', title: 'Resolve inventory alerts', period: 'Current as-of snapshot',
      evidence: `${args.inventoryAlerts.length} product${args.inventoryAlerts.length === 1 ? '' : 's'} are at or below their reorder point.`,
      suggestedAction: 'Verify physical stock, then replenish the highest-selling affected items first.', confidence: 'high',
      limitation: 'Inventory accuracy depends on checkout and cancellation compensation being transactional.', metricToMonitor: 'Stockout count and missed-item demand',
    });
  }
  if (args.repeatRate != null && args.orders.length >= 10 && args.repeatRate < 25) {
    actions.push({
      id: 'improve-repeat', priority: 'medium', title: 'Test a repeat-purchase offer', period: args.periodLabel,
      evidence: `Returning purchasers represent ${args.repeatRate.toFixed(1)}% of purchasers in the selected period.`,
      suggestedAction: 'Run a bounded returning-customer offer and compare repeat purchase rate against a holdout or prior comparable period.',
      confidence: 'medium', limitation: 'This is an observational signal, not evidence that a coupon will cause retention.', metricToMonitor: 'Repeat-purchase rate and contribution margin',
    });
  }
  if (args.averageRating != null && args.reviewCount >= 3 && args.averageRating < 3.8) {
    actions.push({
      id: 'review-feedback', priority: 'high', title: 'Investigate low-rated feedback', period: args.periodLabel,
      evidence: `${args.reviewCount} approved reviews average ${args.averageRating.toFixed(1)} out of 5.`,
      suggestedAction: 'Review low-rated items and follow up on recurring, verifiable service issues.', confidence: 'medium',
      limitation: 'Reviewers are self-selected and may not represent all customers.', metricToMonitor: 'Average rating and low-rating count',
    });
  }
  if (args.costCoveragePct < 100) {
    actions.push({
      id: 'complete-cost-data', priority: 'medium', title: 'Complete order-time cost coverage', period: args.periodLabel,
      evidence: `${args.costCoveragePct.toFixed(1)}% of delivered merchandise value has an immutable cost snapshot.`,
      suggestedAction: 'Record validated item/variant costs and snapshot them on new orders before using margin to make pricing decisions.',
      confidence: 'high', limitation: 'Historical costs must remain unknown unless supported by source records.', metricToMonitor: 'Cost coverage percentage',
    });
  }
  if (args.peakHour && args.orders.length >= 10) {
    actions.push({
      id: 'peak-hour-staffing', priority: 'medium', title: 'Plan around the measured peak hour', period: args.periodLabel,
      evidence: `${String(args.peakHour.hour).padStart(2, '0')}:00 recorded ${args.peakHour.orders} of ${args.orders.length} placed orders.`,
      suggestedAction: 'Compare staffing and preparation capacity during this hour before changing the roster.', confidence: 'medium',
      limitation: 'Placement time does not measure walk-in demand or causation.', metricToMonitor: 'Peak-hour order count and preparation time',
    });
  }
  if (args.profitableItem && args.orders.length >= 10) {
    actions.push({
      id: 'promote-profitable-item', priority: 'low', title: 'Evaluate a cost-covered profitable item', period: args.periodLabel,
      evidence: `${args.profitableItem.productName} recorded ${args.profitableItem.unitsSold} units and ${Math.round(Number(args.profitableItem.grossMarginPaise) / 100)} INR gross profit with 100% cost coverage.`,
      suggestedAction: 'Test its placement or a bounded promotion while monitoring contribution margin, refunds, and substitution.', confidence: 'medium',
      limitation: 'Observed margin does not prove a promotion will create incremental profit.', metricToMonitor: 'Units, gross profit, refunds, and basket contribution',
    });
  }
  if (args.popularCombination && args.orders.length >= 10 && args.popularCombination.orders >= 3) {
    actions.push({
      id: 'popular-combination', priority: 'low', title: 'Evaluate a frequent item combination', period: args.periodLabel,
      evidence: `${args.popularCombination.productNames.join(' + ')} appeared together in ${args.popularCombination.orders} fulfilled orders.`,
      suggestedAction: 'Test clearer joint merchandising without discounting below the recorded contribution margin.', confidence: 'medium',
      limitation: 'Co-purchase is association, not evidence that bundling causes more sales.', metricToMonitor: 'Combination orders, basket value, and gross profit',
    });
  }
  if (args.averagePreparationMinutes != null && args.preparationSamples >= 5 && args.averagePreparationMinutes > args.targetPreparationMinutes) {
    actions.push({
      id: 'preparation-bottleneck', priority: 'high', title: 'Investigate preparation delay', period: args.periodLabel,
      evidence: `${args.preparationSamples} timestamp-complete orders averaged ${args.averagePreparationMinutes.toFixed(1)} minutes versus the configured ${args.targetPreparationMinutes}-minute target.`,
      suggestedAction: 'Review stage timestamps and item mix during the slowest periods before changing the workflow.', confidence: 'high',
      limitation: 'Orders missing stage timestamps are excluded.', metricToMonitor: 'Average preparation time and timestamp coverage',
    });
  }
  if (args.itemTrend && args.orders.length >= 10) {
    const direction = args.itemTrend.changePct >= 0 ? 'gained' : 'lost';
    actions.push({
      id: 'item-sales-trend', priority: 'medium', title: `Review an item that ${direction} sales`, period: args.periodLabel,
      evidence: `${args.itemTrend.productName} moved from ₹${(args.itemTrend.previousPaise / 100).toFixed(2)} to ₹${(args.itemTrend.currentPaise / 100).toFixed(2)} (${args.itemTrend.changePct > 0 ? '+' : ''}${args.itemTrend.changePct.toFixed(1)}%).`,
      suggestedAction: 'Check availability, price, placement, and comparable-period item mix before acting.', confidence: 'medium',
      limitation: 'The comparison is observational and may reflect availability or period mix.', metricToMonitor: 'Comparable-period item sales and units',
    });
  }
  return actions.slice(0, 8);
}

export function computeAnalyticsSnapshot(input: ServiceInput): AnalyticsSnapshot {
  const products = input.rawProducts.map(normalizeProduct);
  const productMap = new Map(products.map(product => [product.id, product]));
  const userMap = new Map(input.rawUsers.map(raw => [id(raw._id ?? raw.id), raw]));
  const allOrders = input.rawOrders
    .map(raw => normalizeOrder(raw, userMap))
    .filter((order): order is NormalizedOrder => order != null)
    .filter(order => orderMatches(order, input.filters));
  const orderById = new Map(allOrders.map(order => [order.id, order]));
  const activeOrders = input.rawActiveOrders
    .map(raw => normalizeOrder(raw, userMap))
    .filter((order): order is NormalizedOrder => order != null)
    .filter(order => orderMatches(order, input.filters));
  const normalizedPayments = input.rawPayments.map(normalizePayment).filter((payment): payment is NormalizedPayment => payment != null);
  const orderScopedPaymentFilters = Boolean(
    input.filters.statuses.length || input.filters.paymentStatuses.length || input.filters.productId ||
    input.filters.variantId || input.filters.categoryId || input.filters.couponCode ||
    input.filters.workerId || input.filters.search,
  );
  const matchingOrderIds = new Set(allOrders.map(order => order.id));
  const payments = normalizedPayments.filter(payment =>
    (!input.filters.paymentMethods.length || input.filters.paymentMethods.includes(payment.method as never)) &&
    (!orderScopedPaymentFilters || matchingOrderIds.has(payment.orderId)),
  );
  const current = periodOrders(allOrders, input.filters.fromUtc, input.filters.toExclusiveUtc);
  const previous = periodOrders(allOrders, input.filters.comparisonFromUtc, input.filters.comparisonToExclusiveUtc);
  const currentFinancials = financials(current);
  const previousFinancials = financials(previous);

  const deliveredLines = currentFinancials.delivered.flatMap(order => order.items);
  const deliveredLineValue = deliveredLines.reduce((sum, item) => sum + item.totalPricePaise, 0);
  const costCoveredValue = deliveredLines.filter(item => item.unitCostPaise != null).reduce((sum, item) => sum + item.totalPricePaise, 0);
  const costCoveragePct = deliveredLineValue === 0 ? 100 : clampPercent(costCoveredValue / deliveredLineValue * 100);
  const knownCosts = deliveredLines.reduce((sum, item) => sum + (item.unitCostPaise == null ? 0 : item.unitCostPaise * item.quantity), 0);

  const previousDeliveredLines = previousFinancials.delivered.flatMap(order => order.items);
  const previousLineValue = previousDeliveredLines.reduce((sum, item) => sum + item.totalPricePaise, 0);
  const previousCoveredValue = previousDeliveredLines.filter(item => item.unitCostPaise != null).reduce((sum, item) => sum + item.totalPricePaise, 0);
  const previousCoverage = previousLineValue ? clampPercent(previousCoveredValue / previousLineValue * 100) : 100;
  const previousKnownCosts = previousDeliveredLines.reduce((sum, item) => sum + (item.unitCostPaise == null ? 0 : item.unitCostPaise * item.quantity), 0);

  const hasExplicitPaymentTotals = allOrders.some(order => order.explicitCollectedPaise != null || order.explicitRefundedPaise != null);
  const paymentMode: AnalyticsSnapshot['dataQuality']['paymentTracking'] = input.paymentCollectionExists
    ? 'events'
    : hasExplicitPaymentTotals ? 'order-totals' : 'unavailable';
  const currentEvents = eventTotals(payments, input.filters.fromUtc, input.filters.toExclusiveUtc);
  const previousEvents = eventTotals(payments, input.filters.comparisonFromUtc, input.filters.comparisonToExclusiveUtc);
  const currentCollected = paymentMode === 'events'
    ? currentEvents.collected
    : paymentMode === 'order-totals'
      ? current.reduce((sum, order) => sum + (order.explicitCollectedPaise ?? 0), 0)
      : null;
  const previousCollected = paymentMode === 'events'
    ? previousEvents.collected
    : paymentMode === 'order-totals'
      ? previous.reduce((sum, order) => sum + (order.explicitCollectedPaise ?? 0), 0)
      : null;
  const currentRefunded = paymentMode === 'events'
    ? currentEvents.refunded
    : paymentMode === 'order-totals'
      ? current.reduce((sum, order) => sum + (order.explicitRefundedPaise ?? 0), 0)
      : null;
  const previousRefunded = paymentMode === 'events'
    ? previousEvents.refunded
    : paymentMode === 'order-totals'
      ? previous.reduce((sum, order) => sum + (order.explicitRefundedPaise ?? 0), 0)
      : null;

  const paymentsByOrder = new Map<string, NormalizedPayment[]>();
  for (const payment of payments) {
    const entries = paymentsByOrder.get(payment.orderId) ?? [];
    entries.push(payment);
    paymentsByOrder.set(payment.orderId, entries);
  }
  const orderMerchandiseRefundAdjustment = (order: NormalizedOrder): number | null => {
    if (paymentMode === 'unavailable') return null;
    const netMerchandisePaise = Math.max(0, order.subtotalPaise - order.discountPaise);
    const refundPaise = paymentMode === 'events'
      ? (paymentsByOrder.get(order.id) ?? []).filter(isRefund).reduce((sum, payment) => sum + payment.amountPaise, 0)
      : order.explicitRefundedPaise ?? 0;
    // A payment refund can include tax or legacy delivery charges. Only the
    // merchandise portion may reduce merchandise sales/profit for this order.
    return Math.min(netMerchandisePaise, refundPaise);
  };
  const recognizedNetMerchandise = (orders: NormalizedOrder[]): number | null => {
    if (!orders.length) return 0;
    let total = 0;
    for (const order of orders) {
      const refundAdjustment = orderMerchandiseRefundAdjustment(order);
      if (refundAdjustment == null) return null;
      total += Math.max(0, order.subtotalPaise - order.discountPaise - refundAdjustment);
    }
    return total;
  };
  const currentRecognizedNetMerchandise = recognizedNetMerchandise(currentFinancials.delivered);
  const previousRecognizedNetMerchandise = recognizedNetMerchandise(previousFinancials.delivered);
  const actualGrossMargin = deliveredLineValue === 0
    ? 0
    : costCoveragePct === 100 && currentRecognizedNetMerchandise != null
      ? currentRecognizedNetMerchandise - knownCosts
      : null;
  const previousGrossMargin = previousLineValue === 0
    ? 0
    : previousCoverage === 100 && previousRecognizedNetMerchandise != null
      ? previousRecognizedNetMerchandise - previousKnownCosts
      : null;
  const outstandingEligible = current.filter(order => order.status !== 'cancelled');
  const paymentCoverageCount = paymentMode === 'events'
    ? outstandingEligible.length
    : outstandingEligible.filter(order => order.explicitCollectedPaise != null).length;
  const paymentCoverageComplete = outstandingEligible.length === 0 || paymentCoverageCount === outstandingEligible.length;
  const outstanding = paymentMode === 'unavailable' || !paymentCoverageComplete ? null : outstandingEligible.reduce((sum, order) => {
    const eventCollections = (paymentsByOrder.get(order.id) ?? []).filter(isCollection).reduce((total, event) => total + event.amountPaise, 0);
    const collected = paymentMode === 'events' ? eventCollections : order.explicitCollectedPaise ?? 0;
    return sum + Math.max(0, order.totalPaise - collected);
  }, 0);

  const soldItemRows: SoldItemAnalyticsRow[] = currentFinancials.delivered.flatMap(order => {
    const discounts = allocateOrderDiscount(order);
    const netWeights = order.items.map((item, index) => Math.max(0, item.totalPricePaise - (discounts[index] ?? 0)));
    const events = paymentsByOrder.get(order.id) ?? [];
    const rawOrderRefunded = paymentMode === 'events'
      ? events.filter(isRefund).reduce((sum, payment) => sum + payment.amountPaise, 0)
      : order.explicitRefundedPaise ?? 0;
    const orderRefunded = Math.min(netWeights.reduce((sum, value) => sum + value, 0), rawOrderRefunded);
    const refundAllocations = allocateIntegerByWeights(orderRefunded, netWeights);
    return order.items.map((item, index): SoldItemAnalyticsRow => {
      const allocatedDiscountPaise = discounts[index] ?? 0;
      const netSalesPaise = Math.max(0, item.totalPricePaise - allocatedDiscountPaise);
      const refundAdjustmentPaise = refundAllocations[index] ?? 0;
      const totalCostPaise = item.unitCostPaise == null ? null : item.unitCostPaise * item.quantity;
      const profitBase = Math.max(0, netSalesPaise - refundAdjustmentPaise);
      const grossProfitPaise = totalCostPaise == null ? null : profitBase - totalCostPaise;
      return {
        orderId: order.id,
        tokenNumber: order.tokenNumber,
        placedAt: order.createdAt.toISOString(),
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        variantName: item.variantName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        lineSalesPaise: item.totalPricePaise,
        allocatedDiscountPaise,
        netSalesPaise,
        refundAdjustmentPaise,
        unitCostPaise: item.unitCostPaise,
        totalCostPaise,
        grossProfitPaise,
        grossMarginPct: grossProfitPaise == null || profitBase <= 0 ? null : Math.round(grossProfitPaise / profitBase * 1000) / 10,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        servingWorker: order.servingWorker,
      };
    });
  }).sort((left, right) => right.placedAt.localeCompare(left.placedAt));

  const deliveredCustomerIds = new Set(currentFinancials.delivered.map(order => order.userId).filter(Boolean));
  const previousDeliveredCustomerIds = new Set(previousFinancials.delivered.map(order => order.userId).filter(Boolean));
  const returningIds = new Set([...deliveredCustomerIds].filter(customerId => input.priorCustomerIds.has(customerId)));
  const newIds = new Set([...deliveredCustomerIds].filter(customerId => !input.priorCustomerIds.has(customerId)));
  const previousHistory = input.priorComparisonCustomerIds ?? new Set<string>();
  const previousReturningIds = new Set([...previousDeliveredCustomerIds].filter(customerId => previousHistory.has(customerId)));
  const previousNewIds = new Set([...previousDeliveredCustomerIds].filter(customerId => !previousHistory.has(customerId)));

  const inventoryRows: InventoryAnalyticsRow[] = products.map(product => ({
    productId: product.id,
    productName: product.name,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    quantity: product.quantity,
    inventoryMode: product.inventoryMode,
    reorderPoint: product.reorderPoint,
    manuallyAvailable: product.available,
    stockStatus: stockStatus(product),
  })).sort((a, b) => a.quantity - b.quantity || a.productName.localeCompare(b.productName));
  const inventoryAlerts = inventoryRows.filter(row => row.stockStatus === 'low_stock' || row.stockStatus === 'out_of_stock');

  const productAggregates = new Map<string, ProductAnalyticsRow>();
  for (const order of currentFinancials.delivered) {
    const allocatedDiscounts = allocateOrderDiscount(order);
    for (const [itemIndex, item] of order.items.entries()) {
      const key = `${item.productId}::${item.variantId}`;
      const currentProduct = productMap.get(item.productId);
      const row = productAggregates.get(key) ?? {
        productId: item.productId,
        productName: item.productName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        variantId: item.variantId,
        variantName: item.variantName,
        unitsSold: 0,
        merchandiseSalesPaise: 0,
        allocatedDiscountPaise: 0,
        knownCostPaise: 0,
        grossMarginPaise: null,
        costCoveragePct: 0,
        cancelledUnits: 0,
        refundAdjustmentPaise: 0,
        currentStock: currentProduct?.quantity ?? null,
        reorderPoint: currentProduct?.reorderPoint ?? null,
        manuallyAvailable: currentProduct?.available ?? null,
        stockStatus: currentProduct ? stockStatus(currentProduct) : 'unknown',
      };
      row.unitsSold += item.quantity;
      row.merchandiseSalesPaise += item.totalPricePaise;
      row.allocatedDiscountPaise += allocatedDiscounts[itemIndex] ?? 0;
      if (item.unitCostPaise != null) row.knownCostPaise = (row.knownCostPaise ?? 0) + item.unitCostPaise * item.quantity;
      productAggregates.set(key, row);
    }
  }
  for (const product of products) {
    const variants = product.variants.length ? product.variants : [{ id: 'base', name: 'Regular' }];
    for (const variant of variants) {
      const key = `${product.id}::${variant.id}`;
      if (!productAggregates.has(key)) {
        productAggregates.set(key, {
          productId: product.id, productName: product.name, categoryId: product.categoryId, categoryName: product.categoryName,
          variantId: variant.id, variantName: variant.name, unitsSold: 0, merchandiseSalesPaise: 0, allocatedDiscountPaise: 0, knownCostPaise: null,
          grossMarginPaise: null, costCoveragePct: 0, currentStock: product.quantity, reorderPoint: product.reorderPoint,
          cancelledUnits: 0, refundAdjustmentPaise: 0,
          manuallyAvailable: product.available, stockStatus: stockStatus(product),
        });
      }
    }
  }
  for (const row of productAggregates.values()) {
    const coveredItems = deliveredLines.filter(item => item.productId === row.productId && item.variantId === row.variantId && item.unitCostPaise != null);
    const coveredValue = coveredItems.reduce((sum, item) => sum + item.totalPricePaise, 0);
    row.costCoveragePct = row.merchandiseSalesPaise ? clampPercent(coveredValue / row.merchandiseSalesPaise * 100) : 0;
    if (row.knownCostPaise === 0 && row.costCoveragePct === 0) row.knownCostPaise = null;
  }
  for (const order of current.filter(order => order.status === 'cancelled')) {
    for (const item of order.items) {
      const row = productAggregates.get(`${item.productId}::${item.variantId}`);
      if (row) row.cancelledUnits += item.quantity;
    }
  }
  for (const item of soldItemRows) {
    const row = productAggregates.get(`${item.productId}::${item.variantId}`);
    if (row) row.refundAdjustmentPaise += item.refundAdjustmentPaise;
  }
  for (const row of productAggregates.values()) {
    row.grossMarginPaise = row.merchandiseSalesPaise > 0 && row.costCoveragePct === 100
      ? row.merchandiseSalesPaise - row.allocatedDiscountPaise - row.refundAdjustmentPaise - (row.knownCostPaise ?? 0)
      : null;
  }
  const productRows = [...productAggregates.values()].sort((a, b) => b.merchandiseSalesPaise - a.merchandiseSalesPaise || a.productName.localeCompare(b.productName));

  const categoryMap = new Map<string, { name: string; units: number; sales: number; orderIds: Set<string> }>();
  for (const order of currentFinancials.delivered) {
    for (const item of order.items) {
      const entry = categoryMap.get(item.categoryId) ?? { name: item.categoryName, units: 0, sales: 0, orderIds: new Set<string>() };
      entry.units += item.quantity;
      entry.sales += item.totalPricePaise;
      entry.orderIds.add(order.id);
      categoryMap.set(item.categoryId, entry);
    }
  }
  const categoryRows = [...categoryMap.entries()].map(([categoryId, entry]) => ({
    categoryId, categoryName: entry.name, unitsSold: entry.units, merchandiseSalesPaise: entry.sales, orderCount: entry.orderIds.size,
  })).sort((a, b) => b.merchandiseSalesPaise - a.merchandiseSalesPaise);

  const combinationMap = new Map<string, { productIds: string[]; productNames: string[]; orders: number }>();
  for (const order of currentFinancials.delivered) {
    const productsInOrder = [...new Map(order.items.map(item => [item.productId, item.productName])).entries()]
      .sort(([left], [right]) => left.localeCompare(right));
    for (let left = 0; left < productsInOrder.length; left += 1) {
      for (let right = left + 1; right < productsInOrder.length; right += 1) {
        const pair = [productsInOrder[left], productsInOrder[right]];
        const key = pair.map(([productId]) => productId).join('::');
        const entry = combinationMap.get(key) ?? {
          productIds: pair.map(([productId]) => productId),
          productNames: pair.map(([, name]) => name),
          orders: 0,
        };
        entry.orders += 1;
        combinationMap.set(key, entry);
      }
    }
  }
  const combinations = [...combinationMap.values()].filter(entry => entry.orders >= 2)
    .sort((left, right) => right.orders - left.orders || left.productNames.join(' + ').localeCompare(right.productNames.join(' + ')))
    .slice(0, 20);

  const ordersByCustomer = new Map<string, NormalizedOrder[]>();
  for (const order of current.filter(order => order.userId)) {
    const entries = ordersByCustomer.get(order.userId) ?? [];
    entries.push(order);
    ordersByCustomer.set(order.userId, entries);
  }
  const customerRows: CustomerAnalyticsRow[] = [...ordersByCustomer.entries()].map(([customerId, orders]): CustomerAnalyticsRow => {
    const delivered = orders.filter(order => FULFILLED_ORDER_STATUSES.has(order.status));
    const representative = delivered[0] ?? orders[0];
    const lifetime = input.lifetimeCustomers.get(customerId);
    return {
      customerId,
      customerName: representative.customerName,
      orderCount: orders.length,
      deliveredOrders: delivered.length,
      lifetimeDeliveredOrders: lifetime?.count ?? delivered.length,
      merchandiseSalesPaise: delivered.reduce((sum, order) => {
        const refundAdjustment = orderMerchandiseRefundAdjustment(order);
        return sum + Math.max(0, order.subtotalPaise - order.discountPaise - (refundAdjustment ?? 0));
      }, 0),
      firstOrderAt: lifetime?.firstOrderAt?.toISOString() ?? delivered[0]?.createdAt.toISOString() ?? null,
      segment: input.priorCustomerIds.has(customerId) ? 'returning' : 'new',
      email: representative.customerEmail || undefined,
      phone: representative.customerPhone || undefined,
    };
  }).sort((a, b) => b.merchandiseSalesPaise - a.merchandiseSalesPaise);
  const repeatPurchaseRate = deliveredCustomerIds.size ? clampPercent(returningIds.size / deliveredCustomerIds.size * 100) : null;
  const purchaseFrequency = deliveredCustomerIds.size
    ? Math.round(currentFinancials.delivered.length / deliveredCustomerIds.size * 100) / 100
    : null;

  const operationOrderMap = new Map<string, NormalizedOrder>();
  for (const order of [...current, ...activeOrders]) operationOrderMap.set(order.id, order);
  const operationRows = [...operationOrderMap.values()].map(order => operationRow(order, input.filters.asOfUtc));
  const queueCounts = new Map<string, number>();
  for (const order of activeOrders) queueCounts.set(order.status, (queueCounts.get(order.status) ?? 0) + 1);
  const cancellationMap = new Map<string, number>();
  for (const row of operationRows.filter(row => row.status === 'cancelled')) {
    const reason = row.cancellationReason || 'Reason not recorded';
    cancellationMap.set(reason, (cancellationMap.get(reason) ?? 0) + 1);
  }

  const couponMap = new Map<string, { orders: NormalizedOrder[]; customers: Set<string> }>();
  for (const order of current.filter(order => order.couponCode)) {
    const entry = couponMap.get(order.couponCode) ?? { orders: [], customers: new Set<string>() };
    entry.orders.push(order);
    if (order.userId) entry.customers.add(order.userId);
    couponMap.set(order.couponCode, entry);
  }
  const couponDocuments = new Map(input.rawCoupons.map(raw => [text(raw.code).toUpperCase(), raw]));
  const couponRows: CouponAnalyticsRow[] = [...couponMap.entries()].map(([couponCode, entry]) => {
    const coupon = couponDocuments.get(couponCode) ?? {};
    const delivered = entry.orders.filter(order => FULFILLED_ORDER_STATUSES.has(order.status));
    const repeatPurchasers = [...entry.customers].filter(customerId => (input.lifetimeCustomers.get(customerId)?.count ?? 0) >= 2).length;
    return {
      couponCode,
      redemptions: entry.orders.length,
      deliveredRedemptions: delivered.length,
      discountsPaise: delivered.reduce((sum, order) => sum + order.discountPaise, 0),
      associatedOrderValuePaise: delivered.reduce((sum, order) => sum + order.totalPaise, 0),
      uniqueCustomers: entry.customers.size,
      repeatPurchasers,
      usageLimit: finite(coupon.usageLimit),
      recordedUsageCount: finite(coupon.usageCount),
    };
  }).sort((a, b) => b.associatedOrderValuePaise - a.associatedOrderValuePaise);

  const reviews = input.rawReviews.map(raw => ({
    id: id(raw._id ?? raw.id),
    createdAt: date(raw.createdAt),
    productId: id(raw.menuItemId),
    rating: Math.max(1, Math.min(5, integer(raw.rating))),
    status: text(raw.status),
    verifiedPurchase: raw.verifiedPurchase === true,
  })).filter(review => review.createdAt != null);
  const currentApprovedReviews = reviews.filter(review => {
    if (review.status !== 'approved' || review.createdAt! < input.filters.fromUtc || review.createdAt! >= input.filters.toExclusiveUtc) return false;
    if (input.filters.productId && review.productId !== input.filters.productId) return false;
    if (input.filters.categoryId && productMap.get(review.productId)?.categoryId !== input.filters.categoryId) return false;
    return true;
  });
  const reviewRows: ReviewAnalyticsRow[] = currentApprovedReviews.map(review => ({
    reviewId: review.id,
    createdAt: review.createdAt!.toISOString(),
    productId: review.productId || 'overall',
    productName: review.productId ? productMap.get(review.productId)?.name ?? 'Unknown or deleted product' : 'Overall experience',
    rating: review.rating,
    status: review.status,
    verifiedPurchase: review.verifiedPurchase,
  }));
  const averageRating = average(currentApprovedReviews.map(review => review.rating));
  const distribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: currentApprovedReviews.filter(review => review.rating === rating).length,
  }));
  const lowItemMap = new Map<string, { sum: number; count: number }>();
  for (const review of currentApprovedReviews.filter(review => review.productId)) {
    const entry = lowItemMap.get(review.productId) ?? { sum: 0, count: 0 };
    entry.sum += review.rating;
    entry.count += 1;
    lowItemMap.set(review.productId, entry);
  }
  const lowRatedItems = [...lowItemMap.entries()].map(([productId, entry]) => ({
    productId,
    productName: productMap.get(productId)?.name ?? 'Unknown or deleted product',
    averageRating: Math.round(entry.sum / entry.count * 10) / 10,
    count: entry.count,
  })).filter(item => item.averageRating <= 3.5)
    .sort((a, b) => a.averageRating - b.averageRating || b.count - a.count);
  const contactMap = new Map<string, number>();
  for (const contact of input.rawContacts) {
    const status = text(contact.status, 'new');
    contactMap.set(status, (contactMap.get(status) ?? 0) + 1);
  }

  const expenseRows: ExpenseAnalyticsRow[] = (input.rawExpenses ?? []).map(raw => {
    const incurredAt = date(raw.incurredAt);
    if (!incurredAt) return null;
    return {
      expenseId: id(raw._id ?? raw.id),
      incurredAt: incurredAt.toISOString(),
      category: text(raw.category, 'other'),
      amountPaise: Math.max(0, integer(raw.amountPaise)),
      note: text(raw.note),
      status: text(raw.status, 'active'),
      recordedById: text(raw.recordedById),
      voidReason: text(raw.voidReason),
    };
  }).filter((row): row is ExpenseAnalyticsRow => row != null)
    .filter(row => new Date(row.incurredAt) >= input.filters.fromUtc && new Date(row.incurredAt) < input.filters.toExclusiveUtc)
    .sort((left, right) => right.incurredAt.localeCompare(left.incurredAt));
  const operatingExpensesPaise = expenseRows.filter(row => row.status === 'active').reduce((sum, row) => sum + row.amountPaise, 0);
  const previousOperatingExpensesPaise = (input.rawExpenses ?? []).reduce((sum, raw) => {
    const incurredAt = date(raw.incurredAt);
    return incurredAt && incurredAt >= input.filters.comparisonFromUtc && incurredAt < input.filters.comparisonToExclusiveUtc && text(raw.status, 'active') === 'active'
      ? sum + Math.max(0, integer(raw.amountPaise))
      : sum;
  }, 0);
  const completeMonths = (input.rawExpensePeriods ?? []).filter(raw => raw.complete === true).map(raw => text(raw.month)).filter(Boolean);
  const completeMonthSet = new Set(completeMonths);
  const requiredMonths = buildBuckets(input.filters.fromUtc, input.filters.toExclusiveUtc, 'month', input.filters.timeZone).map(bucket => bucket.key);
  const previousRequiredMonths = buildBuckets(input.filters.comparisonFromUtc, input.filters.comparisonToExclusiveUtc, 'month', input.filters.timeZone).map(bucket => bucket.key);
  const expenseCompletenessConfirmed = requiredMonths.every(month => completeMonthSet.has(month));
  const previousExpenseCompletenessConfirmed = previousRequiredMonths.every(month => completeMonthSet.has(month));
  const expenseCompletenessPct = requiredMonths.length
    ? clampPercent(requiredMonths.filter(month => completeMonthSet.has(month)).length / requiredMonths.length * 100)
    : 100;
  const recordedNetProfit = actualGrossMargin == null ? null : actualGrossMargin - operatingExpensesPaise;
  const previousRecordedNetProfit = previousGrossMargin == null ? null : previousGrossMargin - previousOperatingExpensesPaise;
  const finalizedNetProfit = expenseCompletenessConfirmed ? recordedNetProfit : null;
  const previousFinalizedNetProfit = previousExpenseCompletenessConfirmed ? previousRecordedNetProfit : null;

  const inventoryEventRows: InventoryEventAnalyticsRow[] = (input.rawInventoryEvents ?? []).map(raw => {
    const occurredAt = date(raw.occurredAt);
    if (!occurredAt || occurredAt < input.filters.fromUtc || occurredAt >= input.filters.toExclusiveUtc) return null;
    const productId = id(raw.menuItemId);
    const product = productMap.get(productId);
    return {
      eventId: id(raw._id ?? raw.id),
      occurredAt: occurredAt.toISOString(),
      productId,
      productName: product?.name ?? 'Unknown or archived item',
      categoryName: product?.categoryName ?? 'Unknown',
      orderId: id(raw.orderId),
      type: text(raw.type),
      quantity: Math.max(0, integer(raw.quantity)),
      quantityDelta: integer(raw.quantityDelta),
      reason: text(raw.reason),
      actorType: text(raw.actorType),
      actorId: text(raw.actorId),
    };
  }).filter((row): row is InventoryEventAnalyticsRow => row != null)
    .filter(row => (!input.filters.productId || row.productId === input.filters.productId) && (!input.filters.categoryId || productMap.get(row.productId)?.categoryId === input.filters.categoryId))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const categorySnapshotCoveragePct = deliveredLines.length
    ? clampPercent(deliveredLines.filter(item => item.categoryWasSnapshotted).length / deliveredLines.length * 100)
    : 100;
  const customerSnapshotCoveragePct = current.length
    ? clampPercent(current.filter(order => order.customerWasSnapshotted).length / current.length * 100)
    : 100;
  const operationsEligible = operationRows.filter(row => FULFILLED_ORDER_STATUSES.has(row.status));
  const operationalTimestampCoveragePct = operationsEligible.length
    ? clampPercent(operationsEligible.filter(row => row.totalFulfilmentMinutes != null).length / operationsEligible.length * 100)
    : 100;
  const limitations: string[] = [];
  const guestBrowserSessions = new Set(current.filter(order => order.customerIdentityType === 'guest').map(order => order.guestSessionId).filter(Boolean));
  if (guestBrowserSessions.size > 0) {
    limitations.push(`${guestBrowserSessions.size} anonymous browser session${guestBrowserSessions.size === 1 ? '' : 's'} placed orders in this period; guest sessions are excluded from account-based unique, new, returning, and repeat-customer metrics.`);
  }
  const lineReconciliationMismatchCount = currentFinancials.delivered.filter(order =>
    order.items.reduce((sum, item) => sum + item.totalPricePaise, 0) !== order.subtotalPaise,
  ).length;
  if (costCoveragePct < 100) limitations.push(`Actual gross margin is unavailable: order-time cost coverage is ${costCoveragePct.toFixed(1)}%.`);
  if (!expenseCompletenessConfirmed) limitations.push(`Finalized net profit is unavailable: ${requiredMonths.filter(month => !completeMonthSet.has(month)).join(', ') || 'the selected period'} has not been confirmed expense-complete.`);
  if (categorySnapshotCoveragePct < 100) limitations.push(`Historical category snapshot coverage is ${categorySnapshotCoveragePct.toFixed(1)}%; current catalog categories or Unknown are used for legacy rows.`);
  if (customerSnapshotCoveragePct < 100) limitations.push(`Immutable customer snapshot coverage is ${customerSnapshotCoveragePct.toFixed(1)}%; current profiles or Unknown are used for legacy rows.`);
  if (operationalTimestampCoveragePct < 100) limitations.push(`Operational duration coverage is ${operationalTimestampCoveragePct.toFixed(1)}%; missing timestamps are excluded, never estimated.`);
  if (paymentMode === 'unavailable') limitations.push('Collected payments, receivables, and refunds are unavailable because explicit payment tracking is absent.');
  else if (!paymentCoverageComplete) limitations.push('Outstanding payments are unavailable because some delivered orders have no explicit collection record.');
  if (paymentMode === 'order-totals') limitations.push('Collection and refund timing uses the selected order cohort because legacy order totals do not record event dates.');
  if (lineReconciliationMismatchCount) limitations.push(`${lineReconciliationMismatchCount} delivered order${lineReconciliationMismatchCount === 1 ? '' : 's'} do not reconcile line snapshots to the stored subtotal; product contribution may differ from order-level merchandise sales.`);
  if (input.filters.variantId) limitations.push('Review feedback has no historical variant identifier and therefore cannot be narrowed by the variant filter.');
  limitations.push('Legacy delivered/cancelled period metrics use order placement time because reliable transition timestamps are incomplete.');

  const orderRows: OrderAnalyticsRow[] = current.map(order => {
    const events = paymentsByOrder.get(order.id) ?? [];
    const collected = paymentMode === 'events'
      ? events.filter(isCollection).reduce((sum, payment) => sum + payment.amountPaise, 0)
      : order.explicitCollectedPaise;
    const refunded = paymentMode === 'events'
      ? events.filter(isRefund).reduce((sum, payment) => sum + payment.amountPaise, 0)
      : order.explicitRefundedPaise;
    return {
      orderId: order.id,
      tokenNumber: order.tokenNumber,
      tokenBusinessDate: order.tokenBusinessDate,
      fulfillmentType: order.fulfillmentType,
      fulfillmentLocation: order.fulfillmentLocation,
      placedAt: order.createdAt.toISOString(),
      customerId: order.userId,
      customerName: order.customerName,
      customerIdentityType: order.customerIdentityType,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      taxPaise: order.taxPaise,
      deliveryPaise: order.deliveryPaise,
      totalPaise: order.totalPaise,
      collectedPaise: paymentMode === 'unavailable' ? null : collected ?? 0,
      refundedPaise: paymentMode === 'unavailable' ? null : refunded ?? 0,
      outstandingPaise: paymentMode === 'unavailable' ? null : Math.max(0, order.totalPaise - (collected ?? 0)),
      servingWorker: order.servingWorker,
      couponCode: order.couponCode,
    };
  }).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const paymentRows: PaymentAnalyticsRow[] = payments
    .filter(payment => payment.occurredAt >= input.filters.fromUtc && payment.occurredAt < input.filters.toExclusiveUtc)
    .map(payment => {
      const order = orderById.get(payment.orderId);
      return {
        orderId: payment.orderId,
        tokenNumber: order?.tokenNumber ?? '',
        fulfillmentType: order ? (order.fulfillmentType === 'counter' ? 'counter' as const : 'delivery' as const) : '' as const,
        occurredAt: payment.occurredAt.toISOString(),
        type: payment.type,
        status: payment.status,
        method: payment.method,
        amountPaise: payment.amountPaise,
        recordedByType: payment.recordedByType,
        recordedById: payment.recordedById,
        recordedByName: payment.recordedByName,
        transactionReference: payment.transactionReference,
      };
    }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdays = weekdayLabels.map((label, key) => ({ key, label, orders: 0 }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  for (const order of current) {
    weekdays[businessWeekday(order.createdAt, input.filters.timeZone)].orders += 1;
    hours[businessHour(order.createdAt, input.filters.timeZone)].orders += 1;
  }
  const paymentMethods = new Map<string, { orders: number; invoice: number }>();
  const statuses = new Map<string, number>();
  for (const order of current) {
    const method = paymentMethods.get(order.paymentMethod) ?? { orders: 0, invoice: 0 };
    method.orders += 1;
    method.invoice += order.totalPaise;
    paymentMethods.set(order.paymentMethod, method);
    statuses.set(order.status, (statuses.get(order.status) ?? 0) + 1);
  }

  const periodLabel = `${formatBusinessDate(input.filters.fromUtc, input.filters.timeZone)} to ${formatBusinessDate(input.filters.toExclusiveUtc, input.filters.timeZone)} (end-exclusive)`;
  const averagePreparationMinutes = average(operationRows.map(row => row.preparationMinutes));
  const averageCollectionWaitMinutes = average(operationRows.map(row => row.readyToServedMinutes));
  const previousOperationRows = previous.map(order => operationRow(order, input.filters.asOfUtc));
  const previousAveragePreparationMinutes = average(previousOperationRows.map(row => row.preparationMinutes));
  const previousAverageCollectionWaitMinutes = average(previousOperationRows.map(row => row.readyToServedMinutes));
  const unitsSold = soldItemRows.reduce((sum, row) => sum + row.quantity, 0);
  const previousUnitsSold = previousFinancials.delivered.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const salesByProduct = (orders: NormalizedOrder[]) => {
    const result = new Map<string, { name: string; paise: number }>();
    for (const order of orders) for (const item of order.items) {
      const currentValue = result.get(item.productId) ?? { name: item.productName, paise: 0 };
      currentValue.paise += item.totalPricePaise;
      result.set(item.productId, currentValue);
    }
    return result;
  };
  const currentProductSales = salesByProduct(currentFinancials.delivered);
  const previousProductSales = salesByProduct(previousFinancials.delivered);
  const itemTrend = [...new Set([...currentProductSales.keys(), ...previousProductSales.keys()])]
    .map(productId => {
      const currentValue = currentProductSales.get(productId);
      const previousValue = previousProductSales.get(productId);
      const previousPaise = previousValue?.paise ?? 0;
      if (previousPaise <= 0) return null;
      const currentPaise = currentValue?.paise ?? 0;
      return {
        productName: currentValue?.name ?? previousValue?.name ?? 'Unknown product',
        currentPaise,
        previousPaise,
        changePct: Math.round((currentPaise - previousPaise) / previousPaise * 1000) / 10,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value != null)
    .sort((left, right) => Math.abs(right.changePct) - Math.abs(left.changePct))[0];
  const configuredPreparationTarget = Number(process.env.TARGET_PREPARATION_MINUTES ?? 20);
  const targetPreparationMinutes = Number.isFinite(configuredPreparationTarget) && configuredPreparationTarget > 0
    ? configuredPreparationTarget
    : 20;
  const actions = buildGrowthActions({
    orders: current,
    inventoryAlerts,
    repeatRate: repeatPurchaseRate,
    averageRating,
    reviewCount: currentApprovedReviews.length,
    costCoveragePct,
    periodLabel,
    peakHour: [...hours].sort((left, right) => right.orders - left.orders)[0],
    profitableItem: [...productRows]
      .filter(row => row.costCoveragePct === 100 && Number(row.grossMarginPaise) > 0)
      .sort((left, right) => Number(right.grossMarginPaise) - Number(left.grossMarginPaise))[0],
    popularCombination: combinations[0],
    averagePreparationMinutes,
    preparationSamples: operationRows.filter(row => row.preparationMinutes != null).length,
    targetPreparationMinutes,
    itemTrend,
  });

  return {
    ok: true,
    meta: {
      asOfUtc: input.filters.asOfUtc.toISOString(),
      lastRefreshedAt: input.filters.asOfUtc.toISOString(),
      timeZone: input.filters.timeZone,
      currency: 'INR',
      definitionsVersion: METRIC_DEFINITIONS_VERSION,
      range: {
        fromUtc: input.filters.fromUtc.toISOString(),
        toExclusiveUtc: input.filters.toExclusiveUtc.toISOString(),
        from: input.filters.from,
        to: input.filters.to,
        label: periodLabel,
      },
      comparisonRange: {
        fromUtc: input.filters.comparisonFromUtc.toISOString(),
        toExclusiveUtc: input.filters.comparisonToExclusiveUtc.toISOString(),
      },
      filters: filtersToWire(input.filters),
    },
    overview: {
      orderVolume: metric(current.length, previous.length, 'count', 'order_volume'),
      deliveredOrders: metric(currentFinancials.delivered.length, previousFinancials.delivered.length, 'count', 'delivered_orders'),
      cancelledOrders: metric(current.filter(order => order.status === 'cancelled').length, previous.filter(order => order.status === 'cancelled').length, 'count', 'cancelled_orders'),
      merchandiseSales: metric(currentFinancials.merchandise, previousFinancials.merchandise, 'paise', 'merchandise_sales'),
      netMerchandiseSales: metric(currentRecognizedNetMerchandise, previousRecognizedNetMerchandise, 'paise', 'net_merchandise_sales', {
        note: currentRecognizedNetMerchandise == null ? 'Refund data required' : undefined,
      }),
      collectedPayments: metric(currentCollected, previousCollected, 'paise', 'collected_payments'),
      outstandingPayments: metric(outstanding, null, 'paise', 'outstanding_payments', { coveragePct: outstandingEligible.length ? clampPercent(paymentCoverageCount / outstandingEligible.length * 100) : 100 }),
      refunds: metric(currentRefunded, previousRefunded, 'paise', 'refunds'),
      averageOrderValue: metric(
        currentFinancials.delivered.length && currentRecognizedNetMerchandise != null ? Math.round(currentRecognizedNetMerchandise / currentFinancials.delivered.length) : null,
        previousFinancials.delivered.length && previousRecognizedNetMerchandise != null ? Math.round(previousRecognizedNetMerchandise / previousFinancials.delivered.length) : null,
        'paise', 'average_order_value',
      ),
      uniqueCustomers: metric(deliveredCustomerIds.size, previousDeliveredCustomerIds.size, 'count', 'unique_customers'),
      newCustomers: metric(newIds.size, previousNewIds.size, 'count', 'new_customers'),
      returningCustomers: metric(returningIds.size, previousReturningIds.size, 'count', 'returning_customers'),
      inventoryAlerts: metric(inventoryAlerts.length, null, 'count', 'inventory_alerts'),
      grossMargin: metric(actualGrossMargin, previousGrossMargin, 'paise', 'gross_margin', {
        coveragePct: costCoveragePct,
        note: actualGrossMargin == null
          ? costCoveragePct < 100 ? 'Cost data required' : 'Refund data required'
          : undefined,
      }),
      taxCollected: metric(currentFinancials.tax, previousFinancials.tax, 'paise', 'tax_collected'),
      unitsSold: metric(unitsSold, previousUnitsSold, 'items', 'units_sold'),
      pendingOrders: metric(activeOrders.length, null, 'count', 'pending_orders'),
      costOfGoodsSold: metric(costCoveragePct === 100 ? knownCosts : null, previousCoverage === 100 ? previousKnownCosts : null, 'paise', 'cost_of_goods_sold', {
        coveragePct: costCoveragePct, note: costCoveragePct === 100 ? undefined : 'Cost data required',
      }),
      operatingExpenses: metric(operatingExpensesPaise, previousOperatingExpensesPaise, 'paise', 'operating_expenses', {
        coveragePct: expenseCompletenessPct, note: expenseCompletenessConfirmed ? 'Expense completeness confirmed' : 'Recorded expenses only; period not confirmed complete',
      }),
      recordedNetProfit: metric(recordedNetProfit, previousRecordedNetProfit, 'paise', 'recorded_net_profit', {
        coveragePct: costCoveragePct,
        note: recordedNetProfit == null
          ? costCoveragePct < 100 ? 'Cost data required' : 'Refund data required'
          : 'Uses recorded operating expenses; completeness may be unconfirmed',
      }),
      finalizedNetProfit: metric(finalizedNetProfit, previousFinalizedNetProfit, 'paise', 'finalized_net_profit', {
        coveragePct: Math.min(costCoveragePct, expenseCompletenessPct), note: finalizedNetProfit == null ? 'Complete cost data and confirmed expense months required' : 'Cost and expense completeness confirmed',
      }),
      averagePreparationMinutes: metric(averagePreparationMinutes, previousAveragePreparationMinutes, 'minutes', 'average_preparation_minutes'),
      averageCollectionWaitMinutes: metric(averageCollectionWaitMinutes, previousAverageCollectionWaitMinutes, 'minutes', 'average_collection_wait_minutes'),
    },
    sales: {
      trend: buildTrend(current, payments, input.filters, paymentMode),
      weekdays,
      hours,
      averageItemsPerOrder: current.length ? Math.round(current.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0) / current.length * 100) / 100 : null,
      averageLinesPerOrder: current.length ? Math.round(current.reduce((sum, order) => sum + order.items.length, 0) / current.length * 100) / 100 : null,
      paymentMethods: [...paymentMethods.entries()].map(([method, value]) => ({ method, orders: value.orders, invoiceTotalPaise: value.invoice })),
      statuses: [...statuses.entries()].map(([status, orders]) => ({ status, orders })),
    },
    products: { rows: productRows, categories: categoryRows, combinations },
    customers: {
      rows: customerRows,
      repeatPurchaseRatePct: repeatPurchaseRate,
      purchaseFrequency,
      cohortStatus: deliveredCustomerIds.size >= 20 ? 'available' : 'insufficient-data',
    },
    operations: {
      queue: ACTIVE_ORDER_STATUSES.map(status => ({ status, orders: queueCounts.get(status) ?? 0 })),
      oldestPending: activeOrders
        .map(order => operationRow(order, input.filters.asOfUtc))
        .sort((left, right) => left.placedAt.localeCompare(right.placedAt))
        .slice(0, 5),
      uncollectedOrders: activeOrders.filter(order => order.paymentStatus !== 'paid').length,
      averagePreparationMinutes,
      averageDeliveryMinutes: average(operationRows.map(row => row.deliveryMinutes)),
      averageFulfilmentMinutes: average(operationRows.map(row => row.totalFulfilmentMinutes)),
      overdueOrders: operationRows.filter(row => row.overdue).length,
      cancellationReasons: [...cancellationMap.entries()].map(([reason, orders]) => ({ reason, orders })).sort((a, b) => b.orders - a.orders),
      rows: operationRows.sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    },
    coupons: { rows: couponRows },
    expenses: {
      rows: expenseRows,
      recordedOperatingExpensesPaise: operatingExpensesPaise,
      completeMonths: completeMonths.sort(),
      requiredMonths,
      completenessConfirmed: expenseCompletenessConfirmed,
    },
    feedback: {
      averageRating,
      reviewCount: currentApprovedReviews.length,
      distribution,
      lowRatedItems,
      moderationBacklog: reviews.filter(review => review.status === 'pending').length,
      contactStatus: [...contactMap.entries()].map(([status, count]) => ({ status, count })),
    },
    actions,
    dataQuality: {
      costCoveragePct,
      categorySnapshotCoveragePct,
      customerSnapshotCoveragePct,
      operationalTimestampCoveragePct,
      expenseCompletenessPct,
      paymentTracking: paymentMode,
      limitations,
    },
    definitions: METRIC_DICTIONARY,
    tables: {
      orders: orderRows,
      products: productRows,
      categories: categoryRows,
      customers: customerRows,
      inventory: inventoryRows,
      coupons: couponRows,
      payments: paymentRows,
      operations: operationRows,
      reviews: reviewRows,
      soldItems: soldItemRows,
      expenses: expenseRows,
      inventoryEvents: inventoryEventRows,
    },
  };
}

function queryProjection() {
  return {
    userId: 1, guestSessionId: 1, claimedByUserId: 1, customerIdentityType: 1,
    items: 1, subtotal: 1, discount: 1, tax: 1, deliveryCharge: 1, totalAmount: 1,
    subtotalPaise: 1, discountPaise: 1, taxPaise: 1, deliveryChargePaise: 1, totalPaise: 1,
    collectedPaise: 1, refundedPaise: 1, paymentMethod: 1, paymentStatus: 1, orderStatus: 1,
    couponCode: 1, couponSnapshot: 1, customerSnapshot: 1, deliveryAddress: 1, createdAt: 1,
    fulfillmentType: 1, fulfillmentLocationId: 1, fulfillmentLocationName: 1,
    tokenNumber: 1, tokenBusinessDate: 1, tokenSequence: 1,
    estimatedDeliveryTime: 1, actualDeliveryTime: 1, estimatedReadyTime: 1,
    servedAt: 1, servedById: 1, servedByName: 1, statusHistory: 1,
  };
}

async function paymentRows(filters: ResolvedAnalyticsFilters, orderIds: string[]) {
  const db = mongoose.connection.db;
  if (!db) return { exists: false, rows: [] as PlainRecord[] };
  const collectionName = 'paymentevents';
  const exists = Boolean(await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext());
  if (!exists) return { exists: false, rows: [] as PlainRecord[] };
  const objectIds = orderIds.filter(value => mongoose.Types.ObjectId.isValid(value)).map(value => new mongoose.Types.ObjectId(value));
  const rows = await db.collection(collectionName).find({
    $or: [
      { occurredAt: { $gte: filters.comparisonFromUtc, $lt: filters.toExclusiveUtc } },
      ...(objectIds.length ? [{ orderId: { $in: objectIds }, occurredAt: { $lt: filters.asOfUtc } }] : []),
    ],
  }, {
    projection: {
      orderId: 1, userId: 1, type: 1, status: 1, amountPaise: 1, occurredAt: 1, method: 1, createdAt: 1,
      recordedByType: 1, recordedById: 1, recordedByName: 1, transactionReference: 1,
    },
  }).limit(MAX_ANALYTICS_ORDERS + 1).toArray() as PlainRecord[];
  if (rows.length > MAX_ANALYTICS_ORDERS) throw new AnalyticsDataLimitError('PAYMENT_DATA_LIMIT_EXCEEDED');
  return { exists: true, rows };
}

export async function getAnalyticsSnapshot(filters: ResolvedAnalyticsFilters): Promise<AnalyticsSnapshot> {
  const ordersPromise = Order.find({
    createdAt: { $gte: filters.comparisonFromUtc, $lt: filters.toExclusiveUtc },
  }).select(queryProjection()).sort({ createdAt: -1 }).limit(MAX_ANALYTICS_ORDERS + 1).lean();
  const activeOrdersPromise = Order.find({
    orderStatus: { $in: ACTIVE_ORDER_STATUSES },
    createdAt: { $lt: filters.asOfUtc },
  }).select(queryProjection()).sort({ createdAt: -1 }).limit(MAX_SUPPORTING_ROWS + 1).lean();
  const productsPromise = MenuItem.find({ archivedAt: null }).select({
    name: 1, category: 1, categoryId: 1, inventoryMode: 1, quantity: 1, reorderPoint: 1, available: 1, variants: 1,
  }).sort({ name: 1 }).limit(5_001).lean();
  const reviewsPromise = Review.find({
    $or: [
      { createdAt: { $gte: filters.fromUtc, $lt: filters.toExclusiveUtc } },
      { status: 'pending' },
    ],
  }).select({ rating: 1, status: 1, menuItemId: 1, verifiedPurchase: 1, createdAt: 1 }).limit(MAX_SUPPORTING_ROWS + 1).lean();
  const contactsPromise = ContactMessage.find({
    createdAt: { $gte: filters.fromUtc, $lt: filters.toExclusiveUtc },
  }).select({ status: 1, createdAt: 1 }).limit(MAX_SUPPORTING_ROWS + 1).lean();
  const couponsPromise = Coupon.find().select({ code: 1, usageLimit: 1, usageCount: 1 }).limit(2_001).lean();
  const expensesPromise = Expense.find({
    incurredAt: { $gte: filters.comparisonFromUtc, $lt: filters.toExclusiveUtc },
  }).select({ incurredAt: 1, category: 1, amountPaise: 1, note: 1, status: 1, recordedById: 1, voidReason: 1 }).sort({ incurredAt: -1 }).limit(MAX_SUPPORTING_ROWS + 1).lean();
  const expensePeriodsPromise = ExpensePeriod.find({ locationId: getFulfillmentCapabilities().locationId })
    .select({ month: 1, complete: 1, note: 1 }).sort({ month: -1 }).limit(36).lean();
  const inventoryEventsPromise = InventoryEvent.find({
    occurredAt: { $gte: filters.fromUtc, $lt: filters.toExclusiveUtc },
  }).select({ menuItemId: 1, orderId: 1, type: 1, quantity: 1, quantityDelta: 1, reason: 1, actorType: 1, actorId: 1, occurredAt: 1 })
    .sort({ occurredAt: -1 }).limit(MAX_SUPPORTING_ROWS + 1).lean();

  const [rawOrdersResult, rawActiveOrdersResult, rawProductsResult, rawReviewsResult, rawContactsResult, rawCouponsResult, rawExpensesResult, rawExpensePeriodsResult, rawInventoryEventsResult] = await Promise.all([
    ordersPromise, activeOrdersPromise, productsPromise, reviewsPromise, contactsPromise, couponsPromise,
    expensesPromise, expensePeriodsPromise, inventoryEventsPromise,
  ]);
  const rawOrders = rawOrdersResult as unknown as PlainRecord[];
  const rawActiveOrders = rawActiveOrdersResult as unknown as PlainRecord[];
  const rawProducts = rawProductsResult as unknown as PlainRecord[];
  const rawReviews = rawReviewsResult as unknown as PlainRecord[];
  const rawContacts = rawContactsResult as unknown as PlainRecord[];
  const rawCoupons = rawCouponsResult as unknown as PlainRecord[];
  const rawExpenses = rawExpensesResult as unknown as PlainRecord[];
  const rawExpensePeriods = rawExpensePeriodsResult as unknown as PlainRecord[];
  const rawInventoryEvents = rawInventoryEventsResult as unknown as PlainRecord[];
  if (rawOrders.length > MAX_ANALYTICS_ORDERS) throw new AnalyticsDataLimitError('ORDER_DATA_LIMIT_EXCEEDED');
  if (rawActiveOrders.length > MAX_SUPPORTING_ROWS || rawReviews.length > MAX_SUPPORTING_ROWS || rawContacts.length > MAX_SUPPORTING_ROWS || rawExpenses.length > MAX_SUPPORTING_ROWS || rawInventoryEvents.length > MAX_SUPPORTING_ROWS) {
    throw new AnalyticsDataLimitError('SUPPORTING_DATA_LIMIT_EXCEEDED');
  }
  if (rawProducts.length > 5_000 || rawCoupons.length > 2_000) throw new AnalyticsDataLimitError('CATALOG_DATA_LIMIT_EXCEEDED');

  const paymentResult = await paymentRows(filters, rawOrders.map(raw => id(raw._id ?? raw.id)));
  const knownOrderIds = new Set(rawOrders.map(raw => id(raw._id ?? raw.id)));
  const additionalPaymentOrderIds = [...new Set(paymentResult.rows.map(raw => id(raw.orderId)).filter(Boolean))]
    .filter(value => !knownOrderIds.has(value) && mongoose.Types.ObjectId.isValid(value));
  const additionalPaymentOrders = additionalPaymentOrderIds.length
    ? await Order.find({ _id: { $in: additionalPaymentOrderIds.map(value => new mongoose.Types.ObjectId(value)) } })
      .select(queryProjection())
      .limit(MAX_ANALYTICS_ORDERS + 1)
      .lean() as unknown as PlainRecord[]
    : [];
  const analyticsOrders = [...rawOrders, ...additionalPaymentOrders];
  if (analyticsOrders.length > MAX_ANALYTICS_ORDERS) throw new AnalyticsDataLimitError('ORDER_DATA_LIMIT_EXCEEDED');

  const orderUserIds = [...new Set([...analyticsOrders, ...rawActiveOrders].map(raw => id(raw.userId) || id(raw.claimedByUserId)).filter(Boolean))];
  const validUserIds = orderUserIds.filter(value => mongoose.Types.ObjectId.isValid(value)).map(value => new mongoose.Types.ObjectId(value));
  const rawUsers = validUserIds.length
    ? await User.find({ _id: { $in: validUserIds } }).select({ fullName: 1, email: 1, phone: 1 }).limit(MAX_SUPPORTING_ROWS).lean() as unknown as PlainRecord[]
    : [];
  const effectiveCustomerPipeline = (before: Date, includeCount: boolean) => [
    { $match: { $or: [{ userId: { $in: validUserIds } }, { claimedByUserId: { $in: validUserIds } }], orderStatus: { $in: ['delivered', 'served'] }, createdAt: { $lt: before } } },
    { $project: { effectiveUserId: { $ifNull: ['$userId', '$claimedByUserId'] }, createdAt: 1 } },
    { $group: { _id: '$effectiveUserId', ...(includeCount ? { count: { $sum: 1 }, firstOrderAt: { $min: '$createdAt' } } : {}) } },
  ];
  const [priorRows, priorComparisonRows, lifetime] = await Promise.all([
    validUserIds.length
      ? Order.aggregate(effectiveCustomerPipeline(filters.fromUtc, false)).option({ maxTimeMS: 10_000 })
      : Promise.resolve([]),
    validUserIds.length
      ? Order.aggregate(effectiveCustomerPipeline(filters.comparisonFromUtc, false)).option({ maxTimeMS: 10_000 })
      : Promise.resolve([]),
    validUserIds.length
      ? Order.aggregate(effectiveCustomerPipeline(filters.asOfUtc, true)).option({ maxTimeMS: 10_000 })
      : Promise.resolve([]),
  ]);
  const priorCustomerIds = new Set((priorRows as PlainRecord[]).map(value => id(value._id)));
  const priorComparisonCustomerIds = new Set((priorComparisonRows as PlainRecord[]).map(value => id(value._id)));
  const lifetimeCustomers = new Map<string, { count: number; firstOrderAt: Date | null }>(
    (lifetime as PlainRecord[]).map(row => [id(row._id), { count: integer(row.count), firstOrderAt: date(row.firstOrderAt) }]),
  );
  return computeAnalyticsSnapshot({
    filters,
    rawOrders: analyticsOrders,
    rawActiveOrders,
    rawProducts,
    rawUsers,
    rawReviews,
    rawContacts,
    rawCoupons,
    rawPayments: paymentResult.rows,
    paymentCollectionExists: paymentResult.exists,
    priorCustomerIds,
    priorComparisonCustomerIds,
    lifetimeCustomers,
    rawExpenses,
    rawExpensePeriods,
    rawInventoryEvents,
  });
}

export function redactSnapshotForDashboard(snapshot: AnalyticsSnapshot): AnalyticsSnapshot {
  const featuredProductRows = new Map<string, ProductAnalyticsRow>();
  const rememberProduct = (row: ProductAnalyticsRow) => featuredProductRows.set(`${row.productId}:${row.variantId}`, row);
  snapshot.products.rows.slice(0, 12).forEach(rememberProduct);
  [...snapshot.products.rows]
    .filter(row => row.manuallyAvailable !== false)
    .sort((left, right) => left.unitsSold - right.unitsSold || left.productName.localeCompare(right.productName))
    .slice(0, 6)
    .forEach(rememberProduct);
  [...snapshot.products.rows]
    .filter(row => row.grossMarginPaise != null)
    .sort((left, right) => Number(right.grossMarginPaise) - Number(left.grossMarginPaise))
    .slice(0, 6)
    .forEach(rememberProduct);
  return {
    ...snapshot,
    products: {
      rows: [...featuredProductRows.values()],
      categories: snapshot.products.categories.slice(0, 12),
      combinations: snapshot.products.combinations.slice(0, 12),
    },
    customers: {
      ...snapshot.customers,
      rows: snapshot.customers.rows.slice(0, 12).map(({ email: _email, phone: _phone, ...row }) => row),
    },
    operations: { ...snapshot.operations, rows: snapshot.operations.rows.slice(0, 12) },
    coupons: { rows: snapshot.coupons.rows.slice(0, 12) },
    tables: {
      orders: snapshot.tables.orders.slice(0, 12),
      products: snapshot.tables.products.slice(0, 12),
      categories: snapshot.tables.categories.slice(0, 12),
      customers: snapshot.tables.customers.slice(0, 12).map(({ email: _email, phone: _phone, ...row }) => row),
      inventory: snapshot.tables.inventory.slice(0, 12),
      coupons: snapshot.tables.coupons.slice(0, 12),
      payments: snapshot.tables.payments.slice(0, 12),
      operations: snapshot.tables.operations.slice(0, 12),
      reviews: snapshot.tables.reviews.slice(0, 12),
      soldItems: snapshot.tables.soldItems.slice(0, 12),
      expenses: snapshot.tables.expenses.slice(0, 12),
      inventoryEvents: snapshot.tables.inventoryEvents.slice(0, 12),
    },
  };
}

export function snapshotPeriodDescription(snapshot: AnalyticsSnapshot) {
  return `${snapshot.meta.range.label}; generated ${formatBusinessDateTime(new Date(snapshot.meta.asOfUtc), snapshot.meta.timeZone)}`;
}

export class AnalyticsDataLimitError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
