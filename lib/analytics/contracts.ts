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

export const PAYMENT_METHODS = ['counter', 'card', 'upi', 'wallet', 'cash'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'] as const;
export const GRANULARITIES = ['day', 'week', 'month'] as const;
export const DATE_PRESETS = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  '7d', '30d', 'mtd', '90d', '12m', 'custom',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type Granularity = (typeof GRANULARITIES)[number];
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface AnalyticsQuery {
  preset?: DatePreset;
  from?: string;
  to?: string;
  group?: Granularity;
  statuses?: OrderStatus[];
  paymentMethods?: PaymentMethod[];
  paymentStatuses?: PaymentStatus[];
  productId?: string;
  variantId?: string;
  categoryId?: string;
  couponCode?: string;
  workerId?: string;
  search?: string;
}

export interface AnalyticsFilterWire {
  preset: DatePreset;
  from: string;
  to: string;
  group: Granularity;
  statuses: OrderStatus[];
  paymentMethods: PaymentMethod[];
  paymentStatuses: PaymentStatus[];
  productId?: string;
  variantId?: string;
  categoryId?: string;
  couponCode?: string;
  workerId?: string;
  search?: string;
}

export interface ResolvedAnalyticsFilters extends AnalyticsFilterWire {
  timeZone: string;
  fromUtc: Date;
  toExclusiveUtc: Date;
  comparisonFromUtc: Date;
  comparisonToExclusiveUtc: Date;
  asOfUtc: Date;
}

export type MetricUnit = 'count' | 'paise' | 'percent' | 'items' | 'minutes';
export type ComparisonKind = 'percent' | 'new' | 'no-comparison';

export interface MetricValue {
  value: number | null;
  unit: MetricUnit;
  previous: number | null;
  changePct: number | null;
  comparison: ComparisonKind;
  definitionId: string;
  coveragePct?: number;
  note?: string;
}

export interface MetricDefinition {
  id: string;
  label: string;
  formula: string;
  includedStatuses: string;
  timestampBasis: string;
  refundTreatment: string;
  denominator?: string;
  limitation?: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  orders: number;
  deliveredOrders: number;
  merchandiseSalesPaise: number;
  discountsPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  invoiceTotalPaise: number;
  collectedPaise: number | null;
  refundedPaise: number | null;
}

export interface ProductAnalyticsRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  variantId: string;
  variantName: string;
  unitsSold: number;
  merchandiseSalesPaise: number;
  allocatedDiscountPaise: number;
  knownCostPaise: number | null;
  grossMarginPaise: number | null;
  costCoveragePct: number;
  cancelledUnits: number;
  refundAdjustmentPaise: number;
  currentStock: number | null;
  reorderPoint: number | null;
  manuallyAvailable: boolean | null;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unlimited' | 'unconfigured' | 'manually_disabled' | 'unknown';
}

export interface SoldItemAnalyticsRow {
  orderId: string;
  tokenNumber: string;
  placedAt: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  unitPricePaise: number;
  lineSalesPaise: number;
  allocatedDiscountPaise: number;
  netSalesPaise: number;
  refundAdjustmentPaise: number;
  unitCostPaise: number | null;
  totalCostPaise: number | null;
  grossProfitPaise: number | null;
  grossMarginPct: number | null;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  servingWorker: string;
}

export interface ExpenseAnalyticsRow {
  expenseId: string;
  incurredAt: string;
  category: string;
  amountPaise: number;
  note: string;
  status: string;
  recordedById: string;
  voidReason: string;
}

export interface InventoryEventAnalyticsRow {
  eventId: string;
  occurredAt: string;
  productId: string;
  productName: string;
  categoryName: string;
  orderId: string;
  type: string;
  quantity: number;
  quantityDelta: number;
  reason: string;
  actorType: string;
  actorId: string;
}

export interface CategoryAnalyticsRow {
  categoryId: string;
  categoryName: string;
  unitsSold: number;
  merchandiseSalesPaise: number;
  orderCount: number;
}

export interface CustomerAnalyticsRow {
  customerId: string;
  customerName: string;
  orderCount: number;
  deliveredOrders: number;
  lifetimeDeliveredOrders: number;
  merchandiseSalesPaise: number;
  firstOrderAt: string | null;
  segment: 'new' | 'returning';
  email?: string;
  phone?: string;
}

export interface OrderAnalyticsRow {
  orderId: string;
  tokenNumber: string;
  tokenBusinessDate: string;
  fulfillmentType: 'counter' | 'delivery';
  fulfillmentLocation: string;
  placedAt: string;
  customerId: string;
  customerName: string;
  customerIdentityType: 'guest' | 'google' | 'registered' | 'legacy';
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  itemCount: number;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  collectedPaise: number | null;
  refundedPaise: number | null;
  outstandingPaise: number | null;
  servingWorker: string;
  couponCode: string;
}

export interface CouponAnalyticsRow {
  couponCode: string;
  redemptions: number;
  deliveredRedemptions: number;
  discountsPaise: number;
  associatedOrderValuePaise: number;
  uniqueCustomers: number;
  repeatPurchasers: number;
  usageLimit: number | null;
  recordedUsageCount: number | null;
}

export interface PaymentAnalyticsRow {
  orderId: string;
  tokenNumber: string;
  fulfillmentType: 'counter' | 'delivery' | '';
  occurredAt: string;
  type: string;
  status: string;
  method: string;
  amountPaise: number;
  recordedByType: string;
  recordedById: string;
  recordedByName: string;
  transactionReference: string;
}

export interface OperationAnalyticsRow {
  orderId: string;
  tokenNumber: string;
  fulfillmentType: 'counter' | 'delivery';
  status: string;
  placedAt: string;
  promisedAt: string | null;
  deliveredAt: string | null;
  servedAt: string | null;
  preparationMinutes: number | null;
  deliveryMinutes: number | null;
  readyToServedMinutes: number | null;
  totalFulfilmentMinutes: number | null;
  cancellationReason: string;
  servingWorker: string;
  overdue: boolean;
}

export interface ReviewAnalyticsRow {
  reviewId: string;
  createdAt: string;
  productId: string;
  productName: string;
  rating: number;
  status: string;
  verifiedPurchase: boolean;
}

export interface InventoryAnalyticsRow {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  inventoryMode: 'tracked' | 'unlimited' | 'unconfigured';
  reorderPoint: number;
  manuallyAvailable: boolean;
  stockStatus: ProductAnalyticsRow['stockStatus'];
}

export interface GrowthAction {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  period: string;
  evidence: string;
  suggestedAction: string;
  confidence: 'high' | 'medium' | 'low';
  limitation: string;
  metricToMonitor: string;
}

export interface AnalyticsTables {
  orders: OrderAnalyticsRow[];
  products: ProductAnalyticsRow[];
  categories: CategoryAnalyticsRow[];
  customers: CustomerAnalyticsRow[];
  inventory: InventoryAnalyticsRow[];
  coupons: CouponAnalyticsRow[];
  payments: PaymentAnalyticsRow[];
  operations: OperationAnalyticsRow[];
  reviews: ReviewAnalyticsRow[];
  soldItems: SoldItemAnalyticsRow[];
  expenses: ExpenseAnalyticsRow[];
  inventoryEvents: InventoryEventAnalyticsRow[];
}

export type AnalyticsTableName = keyof AnalyticsTables;

export interface AnalyticsSnapshot {
  ok: true;
  meta: {
    asOfUtc: string;
    lastRefreshedAt: string;
    timeZone: string;
    currency: 'INR';
    definitionsVersion: string;
    range: { fromUtc: string; toExclusiveUtc: string; from: string; to: string; label: string };
    comparisonRange: { fromUtc: string; toExclusiveUtc: string };
    filters: AnalyticsFilterWire;
  };
  overview: {
    orderVolume: MetricValue;
    deliveredOrders: MetricValue;
    cancelledOrders: MetricValue;
    merchandiseSales: MetricValue;
    netMerchandiseSales: MetricValue;
    collectedPayments: MetricValue;
    outstandingPayments: MetricValue;
    refunds: MetricValue;
    averageOrderValue: MetricValue;
    uniqueCustomers: MetricValue;
    newCustomers: MetricValue;
    returningCustomers: MetricValue;
    inventoryAlerts: MetricValue;
    grossMargin: MetricValue;
    taxCollected: MetricValue;
    unitsSold: MetricValue;
    pendingOrders: MetricValue;
    costOfGoodsSold: MetricValue;
    operatingExpenses: MetricValue;
    recordedNetProfit: MetricValue;
    finalizedNetProfit: MetricValue;
    averagePreparationMinutes: MetricValue;
    averageCollectionWaitMinutes: MetricValue;
  };
  sales: {
    trend: TrendPoint[];
    weekdays: Array<{ key: number; label: string; orders: number }>;
    hours: Array<{ hour: number; orders: number }>;
    averageItemsPerOrder: number | null;
    averageLinesPerOrder: number | null;
    paymentMethods: Array<{ method: string; orders: number; invoiceTotalPaise: number }>;
    statuses: Array<{ status: string; orders: number }>;
  };
  products: {
    rows: ProductAnalyticsRow[];
    categories: CategoryAnalyticsRow[];
    combinations: Array<{ productIds: string[]; productNames: string[]; orders: number }>;
  };
  customers: {
    rows: CustomerAnalyticsRow[];
    repeatPurchaseRatePct: number | null;
    purchaseFrequency: number | null;
    cohortStatus: 'available' | 'insufficient-data';
  };
  operations: {
    queue: Array<{ status: string; orders: number }>;
    oldestPending: OperationAnalyticsRow[];
    uncollectedOrders: number;
    averagePreparationMinutes: number | null;
    averageDeliveryMinutes: number | null;
    averageFulfilmentMinutes: number | null;
    overdueOrders: number;
    cancellationReasons: Array<{ reason: string; orders: number }>;
    rows: OperationAnalyticsRow[];
  };
  coupons: { rows: CouponAnalyticsRow[] };
  expenses: {
    rows: ExpenseAnalyticsRow[];
    recordedOperatingExpensesPaise: number;
    completeMonths: string[];
    requiredMonths: string[];
    completenessConfirmed: boolean;
  };
  feedback: {
    averageRating: number | null;
    reviewCount: number;
    distribution: Array<{ rating: number; count: number }>;
    lowRatedItems: Array<{ productId: string; productName: string; averageRating: number; count: number }>;
    moderationBacklog: number;
    contactStatus: Array<{ status: string; count: number }>;
  };
  actions: GrowthAction[];
  dataQuality: {
    costCoveragePct: number;
    categorySnapshotCoveragePct: number;
    customerSnapshotCoveragePct: number;
    operationalTimestampCoveragePct: number;
    expenseCompletenessPct: number;
    paymentTracking: 'events' | 'order-totals' | 'unavailable';
    limitations: string[];
  };
  definitions: MetricDefinition[];
  tables: AnalyticsTables;
}

export const REPORT_TYPES = [
  'business-summary',
  'detailed-orders-tokens',
  'sold-items',
  'sales-costs-profit',
  'expenses',
  'inventory-wastage',
  'counter-operations',
  'sales-orders',
  'products-categories',
  'customers',
  'inventory',
  'coupons',
  'payments-refunds',
  'operations',
  'reviews',
  'consolidated',
] as const;
export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export type ReportCell = string | number | boolean | null;
export type ReportDataRow = Record<string, ReportCell>;

export interface ReportSection {
  key: string;
  title: string;
  columns: Array<{ key: string; label: string; type: 'text' | 'integer' | 'money' | 'decimal' | 'date' | 'boolean' }>;
  rows: ReportDataRow[];
  totals?: ReportDataRow;
}

export interface BusinessReport {
  title: string;
  reportType: ReportType;
  currency: 'INR';
  generatedAt: string;
  asOfUtc: string;
  period: string;
  comparisonPeriod: string;
  timeZone: string;
  filters: string[];
  definitions: MetricDefinition[];
  limitations: string[];
  sections: ReportSection[];
  rowCount: number;
}
