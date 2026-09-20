import type {
  AnalyticsSnapshot,
  BusinessReport,
  MetricValue,
  ReportDataRow,
  ReportSection,
  ReportType,
} from '@/lib/analytics/contracts';

function metricValue(metric: MetricValue) {
  return metric.value == null ? 'Not available' : metric.value;
}

function overviewSection(snapshot: AnalyticsSnapshot): ReportSection {
  const rows: ReportDataRow[] = [
    ['Order volume', snapshot.overview.orderVolume],
    ['Delivered orders', snapshot.overview.deliveredOrders],
    ['Cancelled orders', snapshot.overview.cancelledOrders],
    ['Gross merchandise sales', snapshot.overview.merchandiseSales],
    ['Net merchandise sales', snapshot.overview.netMerchandiseSales],
    ['Collected payments', snapshot.overview.collectedPayments],
    ['Outstanding payments', snapshot.overview.outstandingPayments],
    ['Refunds', snapshot.overview.refunds],
    ['Average order value', snapshot.overview.averageOrderValue],
    ['Unique customers', snapshot.overview.uniqueCustomers],
    ['First-time customers', snapshot.overview.newCustomers],
    ['Returning customers', snapshot.overview.returningCustomers],
    ['Inventory alerts', snapshot.overview.inventoryAlerts],
    ['Gross margin', snapshot.overview.grossMargin],
    ['Tax collected', snapshot.overview.taxCollected],
    ['Units sold', snapshot.overview.unitsSold],
    ['Current pending orders', snapshot.overview.pendingOrders],
    ['Cost of goods sold', snapshot.overview.costOfGoodsSold],
    ['Recorded operating expenses', snapshot.overview.operatingExpenses],
    ['Recorded-expense net profit', snapshot.overview.recordedNetProfit],
    ['Finalized net profit', snapshot.overview.finalizedNetProfit],
    ['Average preparation minutes', snapshot.overview.averagePreparationMinutes],
    ['Average collection wait minutes', snapshot.overview.averageCollectionWaitMinutes],
  ].map(([label, value]) => {
    const metric = value as MetricValue;
    return {
      metric: String(label),
      value: metricValue(metric),
      unit: metric.unit,
      previous: metric.previous ?? 'Not available',
      absoluteChange: metric.value != null && metric.previous != null ? metric.value - metric.previous : 'Not available',
      comparison: metric.comparison === 'percent' ? `${metric.changePct}%` : metric.comparison === 'new' ? 'New / no comparison' : 'No comparison',
      coverage: metric.coveragePct ?? '',
      definition: metric.definitionId,
      note: metric.note ?? '',
    };
  });
  return {
    key: 'overview',
    title: 'Business overview',
    columns: [
      { key: 'metric', label: 'Metric', type: 'text' },
      { key: 'value', label: 'Value', type: 'decimal' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'previous', label: 'Previous', type: 'decimal' },
      { key: 'absoluteChange', label: 'Absolute change', type: 'decimal' },
      { key: 'comparison', label: 'Comparison', type: 'text' },
      { key: 'coverage', label: 'Coverage (%)', type: 'decimal' },
      { key: 'definition', label: 'Definition ID', type: 'text' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    rows,
  };
}

function orderSection(snapshot: AnalyticsSnapshot, includePii: boolean): ReportSection {
  const rows = snapshot.tables.orders.map(row => ({
    orderId: row.orderId,
    tokenNumber: row.tokenNumber,
    tokenBusinessDate: row.tokenBusinessDate,
    fulfillmentType: row.fulfillmentType,
    fulfillmentLocation: row.fulfillmentLocation,
    placedAt: row.placedAt,
    customerId: row.customerId,
    ...(includePii ? { customerName: row.customerName } : {}),
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    itemCount: row.itemCount,
    subtotalPaise: row.subtotalPaise,
    discountPaise: row.discountPaise,
    taxPaise: row.taxPaise,
    deliveryPaise: row.deliveryPaise,
    totalPaise: row.totalPaise,
    collectedPaise: row.collectedPaise ?? 'Not available',
    refundedPaise: row.refundedPaise ?? 'Not available',
    outstandingPaise: row.outstandingPaise ?? 'Not available',
    servingWorker: row.servingWorker,
    couponCode: row.couponCode,
  }));
  return {
    key: 'orders', title: 'Filtered orders',
    columns: [
      { key: 'orderId', label: 'Order ID', type: 'text' },
      { key: 'tokenNumber', label: 'Token', type: 'text' },
      { key: 'tokenBusinessDate', label: 'Token business date', type: 'text' },
      { key: 'fulfillmentType', label: 'Fulfilment type', type: 'text' },
      { key: 'fulfillmentLocation', label: 'Fulfilment location', type: 'text' },
      { key: 'placedAt', label: 'Placed at (UTC)', type: 'date' },
      { key: 'customerId', label: 'Customer ID', type: 'text' },
      ...(includePii ? [{ key: 'customerName', label: 'Customer name', type: 'text' as const }] : []),
      { key: 'status', label: 'Order status', type: 'text' },
      { key: 'paymentMethod', label: 'Payment method', type: 'text' },
      { key: 'paymentStatus', label: 'Payment status', type: 'text' },
      { key: 'itemCount', label: 'Units', type: 'integer' },
      { key: 'subtotalPaise', label: 'Merchandise subtotal (INR)', type: 'money' },
      { key: 'discountPaise', label: 'Discount (INR)', type: 'money' },
      { key: 'taxPaise', label: 'Tax (INR)', type: 'money' },
      { key: 'deliveryPaise', label: 'Delivery charge (INR)', type: 'money' },
      { key: 'totalPaise', label: 'Invoice total (INR)', type: 'money' },
      { key: 'collectedPaise', label: 'Collected (INR)', type: 'money' },
      { key: 'refundedPaise', label: 'Refunded (INR)', type: 'money' },
      { key: 'outstandingPaise', label: 'Outstanding (INR)', type: 'money' },
      { key: 'servingWorker', label: 'Serving worker', type: 'text' },
      { key: 'couponCode', label: 'Coupon', type: 'text' },
    ],
    rows,
    totals: {
      orderId: 'TOTAL',
      itemCount: rows.reduce((sum, row) => sum + Number(row.itemCount || 0), 0),
      subtotalPaise: rows.reduce((sum, row) => sum + Number(row.subtotalPaise || 0), 0),
      discountPaise: rows.reduce((sum, row) => sum + Number(row.discountPaise || 0), 0),
      taxPaise: rows.reduce((sum, row) => sum + Number(row.taxPaise || 0), 0),
      deliveryPaise: rows.reduce((sum, row) => sum + Number(row.deliveryPaise || 0), 0),
      totalPaise: rows.reduce((sum, row) => sum + Number(row.totalPaise || 0), 0),
      collectedPaise: rows.every(row => typeof row.collectedPaise === 'number') ? rows.reduce((sum, row) => sum + Number(row.collectedPaise || 0), 0) : 'Not available',
      refundedPaise: rows.every(row => typeof row.refundedPaise === 'number') ? rows.reduce((sum, row) => sum + Number(row.refundedPaise || 0), 0) : 'Not available',
      outstandingPaise: rows.every(row => typeof row.outstandingPaise === 'number') ? rows.reduce((sum, row) => sum + Number(row.outstandingPaise || 0), 0) : 'Not available',
    },
  };
}

function productSections(snapshot: AnalyticsSnapshot): ReportSection[] {
  return [
    {
      key: 'products', title: 'Products and variants',
      columns: [
        { key: 'productId', label: 'Product ID', type: 'text' },
        { key: 'productName', label: 'Product', type: 'text' },
        { key: 'variantId', label: 'Variant ID', type: 'text' },
        { key: 'variantName', label: 'Variant', type: 'text' },
        { key: 'categoryId', label: 'Category ID', type: 'text' },
        { key: 'categoryName', label: 'Category', type: 'text' },
        { key: 'unitsSold', label: 'Units sold', type: 'integer' },
        { key: 'merchandiseSalesPaise', label: 'Merchandise sales (INR)', type: 'money' },
        { key: 'allocatedDiscountPaise', label: 'Allocated order discount (INR)', type: 'money' },
        { key: 'knownCostPaise', label: 'Known cost (INR)', type: 'money' },
        { key: 'grossMarginPaise', label: 'Gross margin (INR)', type: 'money' },
        { key: 'costCoveragePct', label: 'Cost coverage (%)', type: 'decimal' },
        { key: 'currentStock', label: 'Current stock', type: 'integer' },
        { key: 'stockStatus', label: 'Stock status', type: 'text' },
      ],
      rows: snapshot.tables.products.map(row => ({ ...row })),
    },
    {
      key: 'categories', title: 'Category contribution',
      columns: [
        { key: 'categoryId', label: 'Category ID', type: 'text' },
        { key: 'categoryName', label: 'Category', type: 'text' },
        { key: 'unitsSold', label: 'Units sold', type: 'integer' },
        { key: 'orderCount', label: 'Orders', type: 'integer' },
        { key: 'merchandiseSalesPaise', label: 'Merchandise sales (INR)', type: 'money' },
      ],
      rows: snapshot.tables.categories.map(row => ({ ...row })),
    },
  ];
}

function customerSection(snapshot: AnalyticsSnapshot, includePii: boolean): ReportSection {
  const columns: ReportSection['columns'] = [
    { key: 'customerId', label: 'Customer ID', type: 'text' },
    { key: 'segment', label: 'Segment', type: 'text' },
    { key: 'orderCount', label: 'Orders in period', type: 'integer' },
    { key: 'deliveredOrders', label: 'Delivered orders', type: 'integer' },
    { key: 'lifetimeDeliveredOrders', label: 'Lifetime delivered orders', type: 'integer' },
    { key: 'merchandiseSalesPaise', label: 'Net merchandise sales (INR)', type: 'money' },
    { key: 'firstOrderAt', label: 'First order at (UTC)', type: 'date' },
  ];
  if (includePii) columns.splice(1, 0,
    { key: 'customerName', label: 'Customer name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
  );
  return {
    key: 'customers', title: includePii ? 'Customers — detailed authorized export' : 'Customers — minimized',
    columns,
    rows: snapshot.tables.customers.map(row => {
      const base: ReportDataRow = {
        customerId: row.customerId, segment: row.segment,
        orderCount: row.orderCount, deliveredOrders: row.deliveredOrders,
        lifetimeDeliveredOrders: row.lifetimeDeliveredOrders,
        merchandiseSalesPaise: row.merchandiseSalesPaise, firstOrderAt: row.firstOrderAt,
      };
      if (includePii) {
        base.customerName = row.customerName;
        base.email = row.email ?? '';
        base.phone = row.phone ?? '';
      }
      return base;
    }),
  };
}

function inventorySection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'inventory', title: 'Current inventory snapshot',
    columns: [
      { key: 'productId', label: 'Product ID', type: 'text' },
      { key: 'productName', label: 'Product', type: 'text' },
      { key: 'categoryId', label: 'Category ID', type: 'text' },
      { key: 'categoryName', label: 'Category', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'integer' },
      { key: 'reorderPoint', label: 'Reorder point', type: 'integer' },
      { key: 'manuallyAvailable', label: 'Manually available', type: 'boolean' },
      { key: 'stockStatus', label: 'Stock status', type: 'text' },
    ],
    rows: snapshot.tables.inventory.map(row => ({ ...row })),
  };
}

function couponSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'coupons', title: 'Coupon usage',
    columns: [
      { key: 'couponCode', label: 'Coupon', type: 'text' },
      { key: 'redemptions', label: 'Placed redemptions', type: 'integer' },
      { key: 'deliveredRedemptions', label: 'Delivered redemptions', type: 'integer' },
      { key: 'discountsPaise', label: 'Delivered discounts (INR)', type: 'money' },
      { key: 'associatedOrderValuePaise', label: 'Associated delivered order value (INR)', type: 'money' },
      { key: 'uniqueCustomers', label: 'Unique customers', type: 'integer' },
      { key: 'repeatPurchasers', label: 'Repeat purchasers', type: 'integer' },
      { key: 'usageLimit', label: 'Usage limit', type: 'integer' },
      { key: 'recordedUsageCount', label: 'Recorded usage count', type: 'integer' },
    ],
    rows: snapshot.tables.coupons.map(row => ({ ...row })),
  };
}

function paymentSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'payments-refunds', title: 'Payment and refund events',
    columns: [
      { key: 'orderId', label: 'Order ID', type: 'text' },
      { key: 'tokenNumber', label: 'Token', type: 'text' },
      { key: 'fulfillmentType', label: 'Fulfilment type', type: 'text' },
      { key: 'occurredAt', label: 'Occurred at (UTC)', type: 'date' },
      { key: 'type', label: 'Event type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'amountPaise', label: 'Amount (INR)', type: 'money' },
      { key: 'recordedByType', label: 'Verified by type', type: 'text' },
      { key: 'recordedById', label: 'Verified by ID', type: 'text' },
      { key: 'recordedByName', label: 'Verified by', type: 'text' },
      { key: 'transactionReference', label: 'Transaction reference', type: 'text' },
    ],
    rows: snapshot.tables.payments.map(row => ({ ...row })),
    totals: {
      orderId: 'TOTAL',
      amountPaise: snapshot.tables.payments.reduce((sum, row) => sum + row.amountPaise, 0),
    },
  };
}

function operationsSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'operations', title: 'Order operations',
    columns: [
      { key: 'orderId', label: 'Order ID', type: 'text' },
      { key: 'tokenNumber', label: 'Token', type: 'text' },
      { key: 'fulfillmentType', label: 'Fulfilment type', type: 'text' },
      { key: 'status', label: 'Current status', type: 'text' },
      { key: 'placedAt', label: 'Placed at (UTC)', type: 'date' },
      { key: 'promisedAt', label: 'Promised at (UTC)', type: 'date' },
      { key: 'deliveredAt', label: 'Delivered at (UTC)', type: 'date' },
      { key: 'servedAt', label: 'Served at (UTC)', type: 'date' },
      { key: 'preparationMinutes', label: 'Preparation minutes', type: 'decimal' },
      { key: 'deliveryMinutes', label: 'Delivery minutes', type: 'decimal' },
      { key: 'readyToServedMinutes', label: 'Ready-to-served minutes', type: 'decimal' },
      { key: 'totalFulfilmentMinutes', label: 'Total fulfilment minutes', type: 'decimal' },
      { key: 'cancellationReason', label: 'Cancellation reason', type: 'text' },
      { key: 'servingWorker', label: 'Serving worker', type: 'text' },
      { key: 'overdue', label: 'Overdue', type: 'boolean' },
    ],
    rows: snapshot.tables.operations.map(row => ({ ...row })),
  };
}

function reviewSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'reviews', title: 'Approved review summary',
    columns: [
      { key: 'reviewId', label: 'Review ID', type: 'text' },
      { key: 'createdAt', label: 'Created at (UTC)', type: 'date' },
      { key: 'productId', label: 'Product ID', type: 'text' },
      { key: 'productName', label: 'Product', type: 'text' },
      { key: 'rating', label: 'Rating', type: 'integer' },
      { key: 'verifiedPurchase', label: 'Verified purchase', type: 'boolean' },
    ],
    rows: snapshot.tables.reviews.map(row => ({ ...row })),
  };
}

function soldItemsSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'sold-items', title: 'Detailed sold items',
    columns: [
      { key: 'placedAt', label: 'Placed at (UTC)', type: 'date' }, { key: 'tokenNumber', label: 'Token', type: 'text' },
      { key: 'orderId', label: 'Order ID', type: 'text' }, { key: 'productId', label: 'Product ID', type: 'text' },
      { key: 'productName', label: 'Item', type: 'text' }, { key: 'variantName', label: 'Variant', type: 'text' },
      { key: 'categoryName', label: 'Category', type: 'text' }, { key: 'quantity', label: 'Quantity', type: 'integer' },
      { key: 'unitPricePaise', label: 'Unit selling price (INR)', type: 'money' }, { key: 'lineSalesPaise', label: 'Line sales (INR)', type: 'money' },
      { key: 'allocatedDiscountPaise', label: 'Allocated discount (INR)', type: 'money' }, { key: 'netSalesPaise', label: 'Net sales (INR)', type: 'money' },
      { key: 'refundAdjustmentPaise', label: 'Refund adjustment (INR)', type: 'money' }, { key: 'unitCostPaise', label: 'Unit cost (INR)', type: 'money' },
      { key: 'totalCostPaise', label: 'Total cost (INR)', type: 'money' }, { key: 'grossProfitPaise', label: 'Gross profit (INR)', type: 'money' },
      { key: 'grossMarginPct', label: 'Gross margin (%)', type: 'decimal' }, { key: 'paymentMethod', label: 'Payment method', type: 'text' },
      { key: 'paymentStatus', label: 'Payment status', type: 'text' }, { key: 'orderStatus', label: 'Order status', type: 'text' },
      { key: 'servingWorker', label: 'Serving worker', type: 'text' },
    ],
    rows: snapshot.tables.soldItems.map(row => ({ ...row })),
    totals: {
      orderId: 'TOTAL', quantity: snapshot.tables.soldItems.reduce((sum, row) => sum + row.quantity, 0),
      lineSalesPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.lineSalesPaise, 0),
      allocatedDiscountPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.allocatedDiscountPaise, 0),
      netSalesPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.netSalesPaise, 0),
      refundAdjustmentPaise: snapshot.tables.soldItems.reduce((sum, row) => sum + row.refundAdjustmentPaise, 0),
      totalCostPaise: snapshot.tables.soldItems.every(row => row.totalCostPaise != null) ? snapshot.tables.soldItems.reduce((sum, row) => sum + Number(row.totalCostPaise), 0) : 'Cost data required',
      grossProfitPaise: snapshot.tables.soldItems.every(row => row.grossProfitPaise != null) ? snapshot.tables.soldItems.reduce((sum, row) => sum + Number(row.grossProfitPaise), 0) : 'Cost data required',
    },
  };
}

function expenseSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'expenses', title: 'Operating expenses',
    columns: [
      { key: 'expenseId', label: 'Expense ID', type: 'text' }, { key: 'incurredAt', label: 'Incurred at (UTC)', type: 'date' },
      { key: 'category', label: 'Category', type: 'text' }, { key: 'amountPaise', label: 'Amount (INR)', type: 'money' },
      { key: 'note', label: 'Note', type: 'text' }, { key: 'status', label: 'Status', type: 'text' },
      { key: 'recordedById', label: 'Recorded by admin ID', type: 'text' }, { key: 'voidReason', label: 'Void reason', type: 'text' },
    ],
    rows: snapshot.tables.expenses.map(row => ({ ...row })),
    totals: { expenseId: 'ACTIVE TOTAL', amountPaise: snapshot.tables.expenses.filter(row => row.status === 'active').reduce((sum, row) => sum + row.amountPaise, 0) },
  };
}

function inventoryEventSection(snapshot: AnalyticsSnapshot): ReportSection {
  return {
    key: 'inventory-events', title: 'Inventory and wastage audit',
    columns: [
      { key: 'eventId', label: 'Event ID', type: 'text' }, { key: 'occurredAt', label: 'Occurred at (UTC)', type: 'date' },
      { key: 'productId', label: 'Product ID', type: 'text' }, { key: 'productName', label: 'Item', type: 'text' },
      { key: 'categoryName', label: 'Category', type: 'text' }, { key: 'orderId', label: 'Order ID', type: 'text' },
      { key: 'type', label: 'Event type', type: 'text' }, { key: 'quantity', label: 'Quantity', type: 'integer' },
      { key: 'quantityDelta', label: 'Stock change', type: 'integer' }, { key: 'reason', label: 'Reason', type: 'text' },
      { key: 'actorType', label: 'Actor type', type: 'text' }, { key: 'actorId', label: 'Actor ID', type: 'text' },
    ], rows: snapshot.tables.inventoryEvents.map(row => ({ ...row })),
  };
}

export function buildBusinessReport(
  snapshot: AnalyticsSnapshot,
  reportType: ReportType,
  includePii = false,
  generatedAt = snapshot.meta.asOfUtc,
): BusinessReport {
  const sectionsByType: Record<Exclude<ReportType, 'consolidated'>, ReportSection[]> = {
    'business-summary': [overviewSection(snapshot)],
    'detailed-orders-tokens': [orderSection(snapshot, includePii)],
    'sold-items': [soldItemsSection(snapshot)],
    'sales-costs-profit': [overviewSection(snapshot), soldItemsSection(snapshot), expenseSection(snapshot)],
    expenses: [expenseSection(snapshot)],
    'inventory-wastage': [inventorySection(snapshot), inventoryEventSection(snapshot)],
    'counter-operations': [operationsSection(snapshot)],
    'sales-orders': [overviewSection(snapshot), orderSection(snapshot, includePii)],
    'products-categories': productSections(snapshot),
    customers: [customerSection(snapshot, includePii)],
    inventory: [inventorySection(snapshot)],
    coupons: [couponSection(snapshot)],
    'payments-refunds': [overviewSection(snapshot), paymentSection(snapshot)],
    operations: [operationsSection(snapshot)],
    reviews: [reviewSection(snapshot)],
  };
  const sections = reportType === 'consolidated'
    ? [
        overviewSection(snapshot),
        orderSection(snapshot, includePii),
        ...productSections(snapshot),
        soldItemsSection(snapshot),
        expenseSection(snapshot),
        inventoryEventSection(snapshot),
        customerSection(snapshot, includePii),
        inventorySection(snapshot),
        couponSection(snapshot),
        paymentSection(snapshot),
        operationsSection(snapshot),
        reviewSection(snapshot),
      ]
    : sectionsByType[reportType];
  const filterLabels = [
    snapshot.meta.filters.statuses.length ? `Statuses: ${snapshot.meta.filters.statuses.join(', ')}` : 'Statuses: all',
    snapshot.meta.filters.paymentMethods.length ? `Payment methods: ${snapshot.meta.filters.paymentMethods.join(', ')}` : 'Payment methods: all',
    snapshot.meta.filters.paymentStatuses.length ? `Payment statuses: ${snapshot.meta.filters.paymentStatuses.join(', ')}` : 'Payment statuses: all',
    snapshot.meta.filters.productId ? `Product ID: ${snapshot.meta.filters.productId}` : '',
    snapshot.meta.filters.variantId ? `Variant ID: ${snapshot.meta.filters.variantId}` : '',
    snapshot.meta.filters.categoryId ? `Category ID: ${snapshot.meta.filters.categoryId}` : '',
    snapshot.meta.filters.couponCode ? `Coupon: ${snapshot.meta.filters.couponCode}` : '',
    snapshot.meta.filters.workerId ? `Serving worker ID: ${snapshot.meta.filters.workerId}` : '',
    snapshot.meta.filters.search ? `Token/order search: ${snapshot.meta.filters.search}` : '',
  ].filter(Boolean);
  return {
    title: 'SHATVIKA CORNER Business Report',
    reportType,
    // Use the analytics snapshot instant so every format carries the same reproducible as-of value.
    generatedAt,
    asOfUtc: snapshot.meta.asOfUtc,
    period: snapshot.meta.range.label,
    comparisonPeriod: `${snapshot.meta.comparisonRange.fromUtc} to ${snapshot.meta.comparisonRange.toExclusiveUtc} (end-exclusive)`,
    timeZone: snapshot.meta.timeZone,
    currency: 'INR',
    filters: filterLabels,
    definitions: snapshot.definitions,
    limitations: snapshot.dataQuality.limitations,
    sections,
    rowCount: sections.reduce((sum, section) => sum + section.rows.length, 0),
  };
}
