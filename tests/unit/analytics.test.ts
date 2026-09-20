import { describe, expect, it } from 'vitest';
import { computeAnalyticsSnapshot } from '@/lib/analytics/service';
import { analyticsFilters, analyticsServiceFixture, zeroPeriodServiceFixture } from '@/tests/fixtures/analytics';

describe('business analytics formulas', () => {
  it('separates sales, collections, refunds, receivables, and unknown cost coverage', () => {
    const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());

    expect(snapshot.overview.orderVolume.value).toBe(4);
    expect(snapshot.overview.deliveredOrders.value).toBe(2);
    expect(snapshot.overview.cancelledOrders.value).toBe(1);
    expect(snapshot.overview.merchandiseSales.value).toBe(28_000);
    expect(snapshot.overview.netMerchandiseSales.value).toBe(27_000);
    expect(snapshot.overview.collectedPayments.value).toBe(30_350);
    expect(snapshot.overview.refunds.value).toBe(10_400);
    expect(snapshot.overview.outstandingPayments.value).toBe(9_450);
    expect(snapshot.overview.averageOrderValue.value).toBe(13_500);
    expect(snapshot.overview.grossMargin.value).toBeNull();
    expect(snapshot.overview.grossMargin.note).toBe('Cost data required');
    expect(snapshot.dataQuality.costCoveragePct).toBe(71.4);
  });

  it('uses purchase history before the period and immutable names when available', () => {
    const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());

    expect(snapshot.overview.newCustomers.value).toBe(1);
    expect(snapshot.overview.returningCustomers.value).toBe(1);
    expect(snapshot.customers.repeatPurchaseRatePct).toBe(50);
    expect(snapshot.tables.customers.find(row => row.customerId === 'customer-returning')).toMatchObject({
      customerName: 'Historical Alice',
      segment: 'returning',
      lifetimeDeliveredOrders: 4,
    });
    expect(snapshot.tables.products.some(row => row.productName === 'Classic Momos')).toBe(true);
    expect(snapshot.tables.products.some(row => row.productName === 'Deleted Product Snapshot Name')).toBe(true);
    expect(snapshot.tables.categories.some(row => row.categoryId === 'unknown')).toBe(true);
  });

  it('groups the inclusive start instant into the Kolkata calendar-day bucket', () => {
    const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());
    const first = snapshot.sales.trend.find(point => point.key === '2026-09-01');

    expect(first).toMatchObject({ orders: 1, deliveredOrders: 1, merchandiseSalesPaise: 20_000 });
    expect(snapshot.tables.orders.some(row => row.orderId === 'outside-range-before-kolkata-midnight')).toBe(false);
  });

  it('uses recorded stage timestamps and does not substitute promised times', () => {
    const snapshot = computeAnalyticsSnapshot(analyticsServiceFixture());
    const complete = snapshot.tables.operations.find(row => row.orderId === 'order-delivered-returning');
    const missing = snapshot.tables.operations.find(row => row.orderId === 'order-delivered-deleted-product');

    expect(complete).toMatchObject({ preparationMinutes: 25, deliveryMinutes: 25, totalFulfilmentMinutes: 60 });
    expect(missing).toMatchObject({ preparationMinutes: null, deliveryMinutes: null, totalFulfilmentMinutes: 60 });
    expect(snapshot.operations.overdueOrders).toBe(1);
  });

  it('returns null averages and no invented growth for a zero-order period', () => {
    const snapshot = computeAnalyticsSnapshot(zeroPeriodServiceFixture());

    expect(snapshot.overview.orderVolume).toMatchObject({ value: 0, previous: 0, changePct: null, comparison: 'no-comparison' });
    expect(snapshot.overview.averageOrderValue.value).toBeNull();
    expect(snapshot.sales.averageItemsPerOrder).toBeNull();
    expect(snapshot.customers.repeatPurchaseRatePct).toBeNull();
    expect(snapshot.feedback.averageRating).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(/NaN|Infinity/);
  });

  it('applies product, status, payment, category, and coupon filters consistently', () => {
    const base = analyticsServiceFixture();
    const filters = analyticsFilters({
      statuses: ['delivered'],
      paymentMethods: ['cash'],
      paymentStatuses: ['partially_refunded'],
      productId: 'product-renamed',
      variantId: 'small',
      categoryId: 'legacy-snacks',
      couponCode: 'SAVE5',
    });
    const snapshot = computeAnalyticsSnapshot({ ...base, filters });

    expect(snapshot.overview.orderVolume.value).toBe(1);
    expect(snapshot.tables.orders.map(row => row.orderId)).toEqual(['order-delivered-returning']);
  });

  it('counts verified UPI captures and preserves counter token and worker reconciliation fields', () => {
    const base = analyticsServiceFixture();
    const rawOrders = [...base.rawOrders, {
      _id: 'counter-served-order', userId: 'customer-new', createdAt: new Date('2026-09-06T06:00:00.000Z'),
      orderStatus: 'served', fulfillmentType: 'counter', tokenNumber: 'SC-0042', tokenBusinessDate: '2026-09-06',
      paymentMethod: 'counter', paymentStatus: 'paid', subtotalPaise: 10_000, discountPaise: 0,
      taxPaise: 500, deliveryChargePaise: 0, totalPaise: 10_500, servedByName: 'Counter One',
      customerSnapshot: { name: 'New Customer' },
      items: [{ menuItemId: 'product-renamed', productName: 'Classic Momos', variantId: 'large', variantName: 'Large', categoryId: 'legacy-snacks', categoryName: 'Legacy Snacks', quantity: 1, unitPricePaise: 10_000, totalPricePaise: 10_000, unitCostPaise: 5_000 }],
      statusHistory: [
        { status: 'accepted', timestamp: new Date('2026-09-06T06:02:00.000Z'), actorType: 'worker' },
        { status: 'ready', timestamp: new Date('2026-09-06T06:10:00.000Z'), actorType: 'worker' },
        { status: 'served', timestamp: new Date('2026-09-06T06:12:00.000Z'), actorType: 'worker' },
      ],
    }];
    const rawPayments = [...base.rawPayments, {
      orderId: 'counter-served-order', occurredAt: new Date('2026-09-06T06:05:00.000Z'),
      type: 'payment_captured', status: 'succeeded', method: 'upi', amountPaise: 10_500,
      recordedByType: 'worker', recordedById: 'worker-1', recordedByName: 'Counter One', transactionReference: 'MERCHANT-42',
    }];
    const snapshot = computeAnalyticsSnapshot({ ...base, rawOrders, rawPayments });

    expect(snapshot.overview.deliveredOrders.value).toBe(3);
    expect(snapshot.overview.collectedPayments.value).toBe(40_850);
    expect(snapshot.tables.payments.find(row => row.orderId === 'counter-served-order')).toMatchObject({
      tokenNumber: 'SC-0042', fulfillmentType: 'counter', method: 'upi', recordedByName: 'Counter One', transactionReference: 'MERCHANT-42',
    });
    expect(snapshot.tables.soldItems.find(row => row.orderId === 'counter-served-order')).toMatchObject({
      tokenNumber: 'SC-0042', servingWorker: 'Counter One', quantity: 1,
    });
  });

  it('separates recorded and finalized net profit and never treats missing historical cost as zero', () => {
    const base = analyticsServiceFixture();
    const fullyCostedOrders = base.rawOrders.map(order => order._id === 'order-delivered-deleted-product'
      ? { ...order, items: order.items.map(item => ({ ...item, unitCostPaise: 3_000 })) }
      : order);
    const common = {
      ...base,
      rawOrders: fullyCostedOrders,
      rawExpenses: [{ _id: 'expense-1', incurredAt: new Date('2026-09-05T00:00:00.000Z'), category: 'rent', amountPaise: 2_000, status: 'active', recordedById: 'admin-1' }],
    };
    const unconfirmed = computeAnalyticsSnapshot({ ...common, rawExpensePeriods: [] });
    expect(unconfirmed.overview.costOfGoodsSold.value).toBe(15_000);
    expect(unconfirmed.overview.grossMargin.value).toBe(12_000);
    expect(unconfirmed.overview.recordedNetProfit.value).toBe(10_000);
    expect(unconfirmed.overview.finalizedNetProfit.value).toBeNull();

    const confirmed = computeAnalyticsSnapshot({ ...common, rawExpensePeriods: [{ month: '2026-09', complete: true }] });
    expect(confirmed.overview.finalizedNetProfit.value).toBe(10_000);
    expect(confirmed.expenses.completenessConfirmed).toBe(true);
  });

  it('classifies comparison-period customers using history before that comparison period', () => {
    const base = analyticsServiceFixture();
    const priorOrder = {
      _id: 'comparison-returning-order', userId: 'customer-returning', createdAt: new Date('2026-08-25T06:00:00.000Z'),
      orderStatus: 'delivered', paymentMethod: 'cash', paymentStatus: 'paid', subtotalPaise: 5_000,
      discountPaise: 0, taxPaise: 250, deliveryChargePaise: 0, totalPaise: 5_250,
      items: [{ menuItemId: 'product-renamed', productName: 'Classic Momos', variantId: 'small', variantName: 'Small', categoryId: 'legacy-snacks', categoryName: 'Legacy Snacks', quantity: 1, unitPricePaise: 5_000, totalPricePaise: 5_000, unitCostPaise: 3_000 }],
      statusHistory: [],
    };
    const snapshot = computeAnalyticsSnapshot({
      ...base,
      rawOrders: [...base.rawOrders, priorOrder],
      priorComparisonCustomerIds: new Set(['customer-returning']),
    });

    expect(snapshot.overview.newCustomers).toMatchObject({ value: 1, previous: 0, comparison: 'new' });
    expect(snapshot.overview.returningCustomers).toMatchObject({ value: 1, previous: 1, changePct: 0, comparison: 'percent' });
  });
});
