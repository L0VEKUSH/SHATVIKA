import type { ResolvedAnalyticsFilters } from '@/lib/analytics/contracts';

export const ANALYTICS_AS_OF = new Date('2026-09-10T06:30:00.000Z');

export function analyticsFilters(overrides: Partial<ResolvedAnalyticsFilters> = {}): ResolvedAnalyticsFilters {
  return {
    preset: 'custom',
    from: '2026-09-01',
    to: '2026-09-11',
    group: 'day',
    statuses: [],
    paymentMethods: [],
    paymentStatuses: [],
    timeZone: 'Asia/Kolkata',
    fromUtc: new Date('2026-08-31T18:30:00.000Z'),
    toExclusiveUtc: ANALYTICS_AS_OF,
    comparisonFromUtc: new Date('2026-08-22T06:30:00.000Z'),
    comparisonToExclusiveUtc: new Date('2026-08-31T18:30:00.000Z'),
    asOfUtc: ANALYTICS_AS_OF,
    ...overrides,
  };
}

/**
 * Deliberately includes historical gaps. Cost/customer/category fields that
 * were never recorded stay absent so analytics must report coverage instead
 * of inventing values.
 */
export function analyticsServiceFixture() {
  const currentOrders = [
    {
      _id: 'order-delivered-returning',
      userId: 'customer-returning',
      createdAt: new Date('2026-08-31T18:30:00.000Z'), // 01 Sep, 00:00 in Kolkata
      orderStatus: 'delivered',
      paymentMethod: 'cash',
      paymentStatus: 'partially_refunded',
      subtotalPaise: 20_000,
      discountPaise: 1_000,
      taxPaise: 950,
      deliveryChargePaise: 2_000,
      totalPaise: 21_950,
      couponSnapshot: { code: 'SAVE5' },
      customerSnapshot: { name: 'Historical Alice', email: 'alice@example.test', phone: '09999999999' },
      items: [{
        menuItemId: 'product-renamed',
        productName: 'Classic Momos',
        variantId: 'small',
        variantName: 'Small',
        categoryId: 'legacy-snacks',
        categoryName: 'Legacy Snacks',
        quantity: 2,
        unitPricePaise: 10_000,
        totalPricePaise: 20_000,
        unitCostPaise: 6_000,
      }],
      actualDeliveryTime: new Date('2026-08-31T19:30:00.000Z'),
      statusHistory: [
        { status: 'accepted', timestamp: new Date('2026-08-31T18:35:00.000Z'), actorType: 'admin' },
        { status: 'ready', timestamp: new Date('2026-08-31T19:00:00.000Z'), actorType: 'admin' },
        { status: 'out_for_delivery', timestamp: new Date('2026-08-31T19:05:00.000Z'), actorType: 'admin' },
        { status: 'delivered', timestamp: new Date('2026-08-31T19:30:00.000Z'), actorType: 'admin' },
      ],
    },
    {
      _id: 'order-delivered-deleted-product',
      userId: 'customer-new',
      createdAt: new Date('2026-09-02T12:00:00.000Z'),
      orderStatus: 'delivered',
      paymentMethod: 'cash',
      paymentStatus: 'refunded',
      subtotalPaise: 8_000,
      discountPaise: 0,
      taxPaise: 400,
      deliveryChargePaise: 0,
      totalPaise: 8_400,
      // No immutable customer/category/cost snapshot: this must remain unknown.
      items: [{
        menuItemId: 'product-deleted',
        name: 'Deleted Product Snapshot Name',
        variantId: 'legacy-large',
        variantName: 'Large',
        quantity: 1,
        unitPricePaise: 8_000,
        totalPricePaise: 8_000,
      }],
      actualDeliveryTime: new Date('2026-09-02T13:00:00.000Z'),
      statusHistory: [],
    },
    {
      _id: 'order-cancelled-unpaid',
      userId: 'customer-new',
      createdAt: new Date('2026-09-03T07:00:00.000Z'),
      orderStatus: 'cancelled',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      subtotalPaise: 5_000,
      discountPaise: 0,
      taxPaise: 250,
      deliveryChargePaise: 2_000,
      totalPaise: 7_250,
      customerSnapshot: { name: 'New Customer' },
      items: [{
        menuItemId: 'product-renamed', productName: 'Classic Momos', variantId: 'large', variantName: 'Large',
        categoryId: 'legacy-snacks', categoryName: 'Legacy Snacks', quantity: 1,
        unitPricePaise: 5_000, totalPricePaise: 5_000,
      }],
      statusHistory: [{
        status: 'cancelled', timestamp: new Date('2026-09-03T07:02:00.000Z'), actorType: 'customer', reason: 'Changed mind',
      }],
    },
    {
      _id: 'order-active-overdue',
      userId: 'customer-new',
      createdAt: new Date('2026-09-09T03:00:00.000Z'),
      orderStatus: 'preparing',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      subtotalPaise: 9_000,
      discountPaise: 0,
      taxPaise: 450,
      deliveryChargePaise: 0,
      totalPaise: 9_450,
      estimatedDeliveryTime: new Date('2026-09-09T04:00:00.000Z'),
      customerSnapshot: { name: 'New Customer' },
      items: [{
        menuItemId: 'product-renamed', productName: 'Classic Momos', variantId: 'large', variantName: 'Large',
        categoryId: 'legacy-snacks', categoryName: 'Legacy Snacks', quantity: 1,
        unitPricePaise: 9_000, totalPricePaise: 9_000, unitCostPaise: 5_000,
      }],
      statusHistory: [{ status: 'accepted', timestamp: new Date('2026-09-09T03:05:00.000Z'), actorType: 'admin' }],
    },
    {
      _id: 'outside-range-before-kolkata-midnight',
      userId: 'customer-outside',
      createdAt: new Date('2026-08-01T18:29:59.000Z'),
      orderStatus: 'delivered',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      subtotalPaise: 999_999,
      discountPaise: 0,
      taxPaise: 0,
      deliveryChargePaise: 0,
      totalPaise: 999_999,
      items: [{ menuItemId: 'outside', name: 'Outside', quantity: 1, unitPricePaise: 999_999 }],
    },
  ];

  return {
    filters: analyticsFilters(),
    rawOrders: currentOrders,
    rawActiveOrders: [currentOrders[3]],
    rawProducts: [{
      _id: 'product-renamed',
      name: 'Renamed Momos',
      category: 'Momos',
      categoryId: 'momos',
      quantity: 2,
      reorderPoint: 3,
      available: true,
      variants: [
        { id: 'small', name: 'Small' },
        { id: 'large', name: 'Large' },
      ],
    }, {
      _id: 'manually-disabled', name: 'Seasonal Item', category: 'Desserts', categoryId: 'desserts',
      quantity: 12, reorderPoint: 2, available: false, variants: [],
    }],
    rawUsers: [
      { _id: 'customer-returning', fullName: 'Renamed Alice', email: 'new-alice@example.test', phone: '01111111111' },
      { _id: 'customer-new', fullName: 'New Customer', email: 'new@example.test', phone: '02222222222' },
    ],
    rawReviews: [
      { _id: 'review-low', menuItemId: 'product-renamed', rating: 2, status: 'approved', verifiedPurchase: true, createdAt: new Date('2026-09-02T00:00:00.000Z') },
      { _id: 'review-pending', menuItemId: 'product-renamed', rating: 5, status: 'pending', verifiedPurchase: false, createdAt: new Date('2026-09-03T00:00:00.000Z') },
    ],
    rawContacts: [
      { _id: 'contact-new', status: 'new', createdAt: new Date('2026-09-02T00:00:00.000Z') },
      { _id: 'contact-resolved', status: 'resolved', createdAt: new Date('2026-09-04T00:00:00.000Z') },
    ],
    rawCoupons: [{ code: 'SAVE5', usageLimit: 10, usageCount: 1 }],
    rawPayments: [
      { orderId: 'order-delivered-returning', occurredAt: new Date('2026-09-01T01:00:00.000Z'), type: 'cash_collected', status: 'succeeded', method: 'cash', amountPaise: 21_950 },
      { orderId: 'order-delivered-returning', occurredAt: new Date('2026-09-04T01:00:00.000Z'), type: 'refund_succeeded', status: 'succeeded', method: 'cash', amountPaise: 2_000 },
      { orderId: 'order-delivered-deleted-product', occurredAt: new Date('2026-09-02T13:00:00.000Z'), type: 'cash_collected', status: 'succeeded', method: 'cash', amountPaise: 8_400 },
      { orderId: 'order-delivered-deleted-product', occurredAt: new Date('2026-09-05T13:00:00.000Z'), type: 'refund_succeeded', status: 'succeeded', method: 'cash', amountPaise: 8_400 },
    ],
    paymentCollectionExists: true,
    priorCustomerIds: new Set(['customer-returning']),
    lifetimeCustomers: new Map([
      ['customer-returning', { count: 4, firstOrderAt: new Date('2026-05-01T00:00:00.000Z') }],
      ['customer-new', { count: 1, firstOrderAt: new Date('2026-09-02T12:00:00.000Z') }],
    ]),
  };
}

export function zeroPeriodServiceFixture() {
  return {
    filters: analyticsFilters(),
    rawOrders: [],
    rawActiveOrders: [],
    rawProducts: [],
    rawUsers: [],
    rawReviews: [],
    rawContacts: [],
    rawCoupons: [],
    rawPayments: [],
    paymentCollectionExists: false,
    priorCustomerIds: new Set<string>(),
    lifetimeCustomers: new Map<string, { count: number; firstOrderAt: Date | null }>(),
  };
}
