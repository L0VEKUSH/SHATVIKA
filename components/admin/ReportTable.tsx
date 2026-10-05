'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { apiRequest, ApiClientError } from '@/lib/apiClient';
import { formatINR } from '@/lib/currency';
import type { AnalyticsFilterWire, AnalyticsSnapshot, AnalyticsTableName, AnalyticsTables } from '@/lib/analytics/contracts';

type RowFor<K extends AnalyticsTableName> = AnalyticsTables[K][number];
type ColumnKind = 'money' | 'date' | 'boolean' | 'percent' | 'integer' | 'status';

type Column<K extends AnalyticsTableName> = {
  key: Extract<keyof RowFor<K>, string>;
  label: string;
  kind?: ColumnKind;
};

type DisplayColumn = { key: string; label: string; kind?: ColumnKind };

type TableResponse<K extends AnalyticsTableName> = {
  ok: true;
  dataset: K;
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  rows: Array<RowFor<K>>;
  meta: Pick<AnalyticsSnapshot['meta'], 'timeZone' | 'lastRefreshedAt'>;
};

const DATASET_COLUMNS = {
  orders: [
    { key: 'placedAt', label: 'Placed', kind: 'date' },
    { key: 'tokenNumber', label: 'Token' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'customerName', label: 'Customer' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'paymentMethod', label: 'Method', kind: 'status' },
    { key: 'paymentStatus', label: 'Payment', kind: 'status' },
    { key: 'itemCount', label: 'Items', kind: 'integer' },
    { key: 'totalPaise', label: 'Invoice total', kind: 'money' },
    { key: 'collectedPaise', label: 'Collected', kind: 'money' },
    { key: 'refundedPaise', label: 'Refunded', kind: 'money' },
    { key: 'outstandingPaise', label: 'Outstanding', kind: 'money' },
    { key: 'servingWorker', label: 'Serving worker' },
  ],
  products: [
    { key: 'productName', label: 'Product' },
    { key: 'variantName', label: 'Variant' },
    { key: 'categoryName', label: 'Category' },
    { key: 'unitsSold', label: 'Units', kind: 'integer' },
    { key: 'merchandiseSalesPaise', label: 'Merchandise sales', kind: 'money' },
    { key: 'grossMarginPaise', label: 'Gross margin', kind: 'money' },
    { key: 'costCoveragePct', label: 'Cost coverage', kind: 'percent' },
    { key: 'currentStock', label: 'Current stock', kind: 'integer' },
    { key: 'stockStatus', label: 'Stock status', kind: 'status' },
  ],
  categories: [
    { key: 'categoryName', label: 'Category' },
    { key: 'unitsSold', label: 'Units', kind: 'integer' },
    { key: 'orderCount', label: 'Orders', kind: 'integer' },
    { key: 'merchandiseSalesPaise', label: 'Merchandise sales', kind: 'money' },
  ],
  customers: [
    { key: 'customerName', label: 'Customer' },
    { key: 'segment', label: 'Segment', kind: 'status' },
    { key: 'orderCount', label: 'Period orders', kind: 'integer' },
    { key: 'deliveredOrders', label: 'Delivered', kind: 'integer' },
    { key: 'lifetimeDeliveredOrders', label: 'Lifetime delivered', kind: 'integer' },
    { key: 'merchandiseSalesPaise', label: 'Historical value', kind: 'money' },
    { key: 'firstOrderAt', label: 'First order', kind: 'date' },
  ],
  inventory: [
    { key: 'productName', label: 'Product' },
    { key: 'categoryName', label: 'Category' },
    { key: 'inventoryMode', label: 'Inventory mode', kind: 'status' },
    { key: 'quantity', label: 'Quantity', kind: 'integer' },
    { key: 'reorderPoint', label: 'Reorder point', kind: 'integer' },
    { key: 'manuallyAvailable', label: 'Enabled', kind: 'boolean' },
    { key: 'stockStatus', label: 'Stock status', kind: 'status' },
  ],
  coupons: [
    { key: 'couponCode', label: 'Coupon' },
    { key: 'redemptions', label: 'Redemptions', kind: 'integer' },
    { key: 'deliveredRedemptions', label: 'Delivered', kind: 'integer' },
    { key: 'discountsPaise', label: 'Discounts given', kind: 'money' },
    { key: 'associatedOrderValuePaise', label: 'Associated order value', kind: 'money' },
    { key: 'uniqueCustomers', label: 'Customers', kind: 'integer' },
    { key: 'repeatPurchasers', label: 'Repeat purchasers', kind: 'integer' },
    { key: 'usageLimit', label: 'Usage limit', kind: 'integer' },
  ],
  payments: [
    { key: 'occurredAt', label: 'Occurred', kind: 'date' },
    { key: 'tokenNumber', label: 'Token' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'type', label: 'Event', kind: 'status' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'method', label: 'Method', kind: 'status' },
    { key: 'amountPaise', label: 'Amount', kind: 'money' },
    { key: 'recordedByName', label: 'Verified by' },
    { key: 'transactionReference', label: 'Reference' },
  ],
  operations: [
    { key: 'placedAt', label: 'Placed', kind: 'date' },
    { key: 'tokenNumber', label: 'Token' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'preparationMinutes', label: 'Preparation', kind: 'integer' },
    { key: 'deliveryMinutes', label: 'Delivery', kind: 'integer' },
    { key: 'totalFulfilmentMinutes', label: 'Fulfilment', kind: 'integer' },
    { key: 'overdue', label: 'Overdue', kind: 'boolean' },
    { key: 'cancellationReason', label: 'Cancellation reason' },
  ],
  reviews: [
    { key: 'createdAt', label: 'Submitted', kind: 'date' },
    { key: 'productName', label: 'Product' },
    { key: 'rating', label: 'Rating', kind: 'integer' },
    { key: 'status', label: 'Moderation', kind: 'status' },
    { key: 'verifiedPurchase', label: 'Verified purchase', kind: 'boolean' },
  ],
  soldItems: [
    { key: 'placedAt', label: 'Placed', kind: 'date' }, { key: 'tokenNumber', label: 'Token' },
    { key: 'productName', label: 'Item' }, { key: 'variantName', label: 'Variant' }, { key: 'categoryName', label: 'Category' },
    { key: 'quantity', label: 'Qty', kind: 'integer' }, { key: 'unitPricePaise', label: 'Unit price', kind: 'money' },
    { key: 'allocatedDiscountPaise', label: 'Discount', kind: 'money' }, { key: 'netSalesPaise', label: 'Net sales', kind: 'money' },
    { key: 'refundAdjustmentPaise', label: 'Refund adjustment', kind: 'money' }, { key: 'totalCostPaise', label: 'Cost', kind: 'money' },
    { key: 'grossProfitPaise', label: 'Gross profit', kind: 'money' }, { key: 'grossMarginPct', label: 'Margin', kind: 'percent' },
    { key: 'paymentStatus', label: 'Payment', kind: 'status' }, { key: 'orderStatus', label: 'Order', kind: 'status' },
    { key: 'servingWorker', label: 'Serving worker' },
  ],
  expenses: [
    { key: 'incurredAt', label: 'Incurred', kind: 'date' }, { key: 'category', label: 'Category', kind: 'status' },
    { key: 'amountPaise', label: 'Amount', kind: 'money' }, { key: 'note', label: 'Note' },
    { key: 'status', label: 'Status', kind: 'status' }, { key: 'voidReason', label: 'Void reason' },
  ],
  inventoryEvents: [
    { key: 'occurredAt', label: 'Occurred', kind: 'date' }, { key: 'productName', label: 'Item' },
    { key: 'categoryName', label: 'Category' }, { key: 'type', label: 'Event', kind: 'status' },
    { key: 'quantity', label: 'Qty', kind: 'integer' }, { key: 'quantityDelta', label: 'Stock change', kind: 'integer' },
    { key: 'reason', label: 'Reason' }, { key: 'actorType', label: 'Actor', kind: 'status' }, { key: 'orderId', label: 'Order ID' },
  ],
} satisfies { [K in AnalyticsTableName]: ReadonlyArray<Column<K>> };

const DEFAULT_SORT = {
  orders: { key: 'placedAt', direction: 'desc' },
  products: { key: 'unitsSold', direction: 'desc' },
  categories: { key: 'merchandiseSalesPaise', direction: 'desc' },
  customers: { key: 'merchandiseSalesPaise', direction: 'desc' },
  inventory: { key: 'quantity', direction: 'asc' },
  coupons: { key: 'redemptions', direction: 'desc' },
  payments: { key: 'occurredAt', direction: 'desc' },
  operations: { key: 'placedAt', direction: 'desc' },
  reviews: { key: 'createdAt', direction: 'desc' },
  soldItems: { key: 'placedAt', direction: 'desc' },
  expenses: { key: 'incurredAt', direction: 'desc' },
  inventoryEvents: { key: 'occurredAt', direction: 'desc' },
} as const satisfies { [K in AnalyticsTableName]: { key: Extract<keyof RowFor<K>, string>; direction: 'asc' | 'desc' } };

const DATASET_LABELS: Record<AnalyticsTableName, string> = {
  orders: 'Orders', products: 'Products and variants', categories: 'Categories', customers: 'Customers',
  inventory: 'Inventory', coupons: 'Coupons', payments: 'Payments and refunds', operations: 'Operations', reviews: 'Review summary',
  soldItems: 'Detailed sold items', expenses: 'Operating expenses', inventoryEvents: 'Inventory and wastage audit',
};

function searchParams(filters: AnalyticsFilterWire, dataset: AnalyticsTableName, page: number, pageSize: number, sort: string, direction: 'asc' | 'desc') {
  const params = new URLSearchParams({ preset: filters.preset, from: filters.from, to: filters.to, group: filters.group, dataset, page: String(page), pageSize: String(pageSize), sort, direction });
  filters.statuses.forEach(value => params.append('status', value));
  filters.paymentMethods.forEach(value => params.append('paymentMethod', value));
  filters.paymentStatuses.forEach(value => params.append('paymentStatus', value));
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.variantId) params.set('variantId', filters.variantId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.couponCode) params.set('couponCode', filters.couponCode);
  if (filters.workerId) params.set('workerId', filters.workerId);
  if (filters.search) params.set('search', filters.search);
  return params;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cellValue(value: unknown, column: { kind?: ColumnKind }, timeZone: string) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (column.kind === 'money') {
    const amount = finiteNumber(value);
    return amount === null ? 'Not recorded' : formatINR(amount / 100);
  }
  if (column.kind === 'percent') {
    const amount = finiteNumber(value);
    return amount === null ? 'Not recorded' : `${amount.toFixed(1)}%`;
  }
  if (column.kind === 'date') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
  }
  if (column.kind === 'boolean') return value ? 'Yes' : 'No';
  if (column.kind === 'integer') {
    const amount = finiteNumber(value);
    return amount === null ? 'Not recorded' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount);
  }
  return String(value).replaceAll('_', ' ');
}

function isTableResponse<K extends AnalyticsTableName>(value: unknown, dataset: K): value is TableResponse<K> {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  const meta = response.meta as Record<string, unknown> | undefined;
  return response.ok === true && response.dataset === dataset && Array.isArray(response.rows) &&
    typeof response.page === 'number' && typeof response.pageSize === 'number' &&
    typeof response.total === 'number' && typeof response.pages === 'number' &&
    Boolean(meta && typeof meta.timeZone === 'string' && typeof meta.lastRefreshedAt === 'string');
}

function rowKey(dataset: AnalyticsTableName, row: Record<string, unknown>, index: number) {
  switch (dataset) {
    case 'orders':
    case 'operations':
      return String(row.orderId ?? index);
    case 'products':
      return `${String(row.productId ?? '')}:${String(row.variantId ?? '')}:${index}`;
    case 'categories':
      return String(row.categoryId ?? index);
    case 'customers':
      return String(row.customerId ?? index);
    case 'inventory':
      return String(row.productId ?? index);
    case 'coupons':
      return String(row.couponCode ?? index);
    case 'payments':
      return `${String(row.orderId ?? '')}:${String(row.occurredAt ?? '')}:${String(row.type ?? '')}:${index}`;
    case 'reviews':
      return String(row.reviewId ?? index);
    case 'soldItems':
      return `${String(row.orderId ?? '')}:${String(row.productId ?? '')}:${String(row.variantId ?? '')}:${index}`;
    case 'expenses':
      return String(row.expenseId ?? index);
    case 'inventoryEvents':
      return String(row.eventId ?? index);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your admin session expired. Sign in again to view this table.';
    if (error.code === 'ORDER_DATA_LIMIT_EXCEEDED' || error.code === 'SUPPORTING_DATA_LIMIT_EXCEEDED') return 'This range contains too much data. Narrow the filters and try again.';
    if (error.code === 'DATABASE_UNAVAILABLE') return 'Analytics are temporarily unavailable because the database could not be reached.';
    return error.message;
  }
  return 'The detailed data could not be loaded.';
}

export default function ReportTable({ dataset, filters, title, description }: { dataset: AnalyticsTableName; filters: AnalyticsFilterWire; title?: string; description?: string }) {
  const columns: ReadonlyArray<DisplayColumn> = DATASET_COLUMNS[dataset];
  const defaults = DEFAULT_SORT[dataset];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<string>(defaults.key);
  const [direction, setDirection] = useState<'asc' | 'desc'>(defaults.direction);
  const [resultState, setResultState] = useState<{ key: string; value: TableResponse<AnalyticsTableName> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const filterSignature = useMemo(() => JSON.stringify(filters), [filters]);
  const requestKey = useMemo(
    () => JSON.stringify([dataset, filterSignature, page, pageSize, sort, direction]),
    [dataset, direction, filterSignature, page, pageSize, sort],
  );

  useEffect(() => {
    setPage(1);
    setSort(DEFAULT_SORT[dataset].key);
    setDirection(DEFAULT_SORT[dataset].direction);
  }, [dataset, filterSignature]);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setErrorState(null);
    try {
      const params = searchParams(filters, dataset, page, pageSize, sort, direction);
      const payload = await apiRequest<unknown>(`/api/admin/analytics/table?${params.toString()}`, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestSequence.current) return;
      if (!isTableResponse(payload, dataset)) throw new Error('The analytics table response did not match the requested dataset.');
      const lastPage = Math.max(payload.pages, 1);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setResultState({ key: requestKey, value: payload as TableResponse<AnalyticsTableName> });
    } catch (loadError) {
      if (!controller.signal.aborted && requestId === requestSequence.current) {
        setErrorState({ key: requestKey, message: errorMessage(loadError) });
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [dataset, direction, filters, page, pageSize, requestKey, sort]);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  function sortBy(key: string) {
    setPage(1);
    if (sort === key) setDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDirection('asc'); }
  }

  const result = resultState?.key === requestKey ? resultState.value : null;
  const error = errorState?.key === requestKey ? errorState.message : '';
  const busy = loading || (!result && !error);
  const pages = Math.max(result?.pages ?? 1, 1);
  const start = result && result.total > 0 ? (result.page - 1) * result.pageSize + 1 : 0;
  const end = result ? Math.min(result.page * result.pageSize, result.total) : 0;
  const timeZone = result?.meta.timeZone ?? 'Asia/Kolkata';

  return (
    <section className="glass overflow-hidden rounded-2xl border border-white/10" aria-labelledby={`table-${dataset}`} aria-busy={busy}>
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 id={`table-${dataset}`} className="text-sm font-bold text-white">{title ?? DATASET_LABELS[dataset]}</h3>
          <p className="mt-1 text-xs text-gray-500">{description ?? 'Authorized, filtered database records. Select a heading to sort.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor={`page-size-${dataset}`}>Rows per page</label>
          <select id={`page-size-${dataset}`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">
            {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-8 text-center" role="alert">
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold text-[#FF8C00] hover:underline">Try again</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <caption className="sr-only">{DATASET_LABELS[dataset]} for the selected analytics period and filters</caption>
            <thead className="bg-white/[0.025]"><tr>
              {columns.map(column => (
                <th key={column.key} scope="col" aria-sort={sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">
                  <button type="button" onClick={() => sortBy(column.key)} className="inline-flex items-center gap-1 rounded focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">
                    {column.label}
                    {sort === column.key ? <ChevronDown className={`h-3 w-3 transition-transform ${direction === 'asc' ? 'rotate-180' : ''}`} aria-hidden="true" /> : <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />}
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {busy && !result ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="animate-pulse">{columns.map(column => <td key={column.key} className="px-4 py-4"><span className="block h-3 w-20 rounded bg-white/5" /></td>)}</tr>
              )) : result?.rows.length ? result.rows.map((row, index) => (
                <tr key={rowKey(dataset, row as unknown as Record<string, unknown>, index)} className="transition-colors hover:bg-white/[0.025]">
                  {columns.map(column => {
                    const rawValue = (row as unknown as Record<string, unknown>)[column.key];
                    const displayValue = cellValue(rawValue, column, timeZone);
                    const missing = rawValue === null || rawValue === undefined || rawValue === '';
                    return (
                      <td key={column.key} className={`max-w-[18rem] whitespace-nowrap px-4 py-3 ${missing ? 'text-gray-600' : column.kind === 'money' ? 'font-semibold text-[#FFB347]' : 'text-gray-300'}`} title={displayValue}>
                        <span className={column.kind === 'status' && !missing ? 'inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 capitalize text-[11px]' : 'block truncate'}>{displayValue}</span>
                      </td>
                    );
                  })}
                </tr>
              )) : <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-gray-500">No records match the selected period and filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <span aria-live="polite">{busy ? 'Loading records…' : `Showing ${start}–${end} of ${result?.total ?? 0}`}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={busy || page <= 1} className="rounded-lg border border-white/10 p-2 text-gray-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <span>Page {Math.min(page, pages)} of {pages}</span>
          <button type="button" onClick={() => setPage(current => Math.min(pages, current + 1))} disabled={busy || page >= pages} className="rounded-lg border border-white/10 p-2 text-gray-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}
