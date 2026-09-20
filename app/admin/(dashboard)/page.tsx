'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, BarChart3, Boxes, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, Download, Filter, Flame, IndianRupee, Lightbulb, PackageSearch, ReceiptIndianRupee,
  RefreshCw, RotateCcw, ShoppingBag, Star, Tags, Users, WalletCards,
} from 'lucide-react';
import { apiRequest, ApiClientError } from '@/lib/apiClient';
import { formatINR } from '@/lib/currency';
import ReportsPanel from '@/components/admin/ReportsPanel';
import ReportTable from '@/components/admin/ReportTable';
import {
  DATE_PRESETS, GRANULARITIES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES,
  type AnalyticsFilterWire, type AnalyticsSnapshot, type AnalyticsTableName, type DatePreset,
  type Granularity, type MetricValue, type OrderStatus, type PaymentMethod, type PaymentStatus,
  type TrendPoint,
} from '@/lib/analytics/contracts';

type FilterDraft = {
  preset: DatePreset;
  from: string;
  to: string;
  group: Granularity;
  statuses: OrderStatus[];
  paymentMethods: PaymentMethod[];
  paymentStatuses: PaymentStatus[];
  productId: string;
  variantId: string;
  categoryId: string;
  couponCode: string;
  workerId: string;
  search: string;
};

const DEFAULT_FILTERS: FilterDraft = {
  preset: '30d', from: '', to: '', group: 'day', statuses: [], paymentMethods: [], paymentStatuses: [],
  productId: '', variantId: '', categoryId: '', couponCode: '', workerId: '', search: '',
};

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', yesterday: 'Yesterday', this_week: 'This week so far', last_week: 'Last completed week',
  this_month: 'This month so far', last_month: 'Last completed month',
  '7d': 'Last 7 days', '30d': 'Last 30 days', mtd: 'Month to date',
  '90d': 'Last 90 days', '12m': 'Last 12 months', custom: 'Custom range',
};

const SECTION_LINKS = [
  ['overview', 'Overview'], ['sales', 'Sales'], ['products', 'Products'], ['customers', 'Customers'],
  ['operations', 'Operations'], ['expenses', 'Expenses & profit'], ['coupons', 'Coupons'], ['feedback', 'Feedback'], ['actions', 'Growth actions'],
  ['details', 'Data explorer'], ['reports', 'Reports'],
] as const;

const TABLE_LABELS: Record<AnalyticsTableName, string> = {
  orders: 'Orders', products: 'Products', categories: 'Categories', customers: 'Customers', inventory: 'Inventory',
  coupons: 'Coupons', payments: 'Payments/refunds', operations: 'Operations', reviews: 'Reviews',
  soldItems: 'Sold items', expenses: 'Expenses', inventoryEvents: 'Inventory/wastage audit',
};

function dashboardParams(filters: FilterDraft) {
  const params = new URLSearchParams({ preset: filters.preset, group: filters.group });
  if (filters.preset === 'custom') {
    params.set('from', filters.from);
    params.set('to', filters.to);
  }
  filters.statuses.forEach(value => params.append('status', value));
  filters.paymentMethods.forEach(value => params.append('paymentMethod', value));
  filters.paymentStatuses.forEach(value => params.append('paymentStatus', value));
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.variantId) params.set('variantId', filters.variantId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.couponCode.trim()) params.set('couponCode', filters.couponCode.trim().toUpperCase());
  if (filters.workerId.trim()) params.set('workerId', filters.workerId.trim());
  if (filters.search.trim()) params.set('search', filters.search.trim());
  return params;
}

function readableError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your admin session expired. Sign in again to continue.';
    if (error.code === 'DATABASE_UNAVAILABLE') return 'The analytics database is temporarily unavailable.';
    if (error.code === 'CUSTOM_RANGE_REQUIRED') return 'Choose both custom dates. The end date is exclusive.';
    if (error.code === 'INVALID_RANGE') return 'The start date must be before the exclusive end date.';
    if (error.code === 'RANGE_TOO_LARGE') return 'Choose a range of 366 days or fewer.';
    if (error.code.includes('DATA_LIMIT')) return 'This range contains too many records. Narrow the period or filters.';
    return error.message;
  }
  return 'Analytics could not be loaded.';
}

function moneyPaise(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Not recorded' : formatINR(value / 100);
}

function numberValue(value: number | null | undefined, suffix = '') {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'Not recorded'
    : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function metricDisplay(metric: MetricValue) {
  if (metric.value === null || !Number.isFinite(metric.value)) {
    return metric.definitionId === 'gross_margin' ? 'Cost data required' : 'Not recorded';
  }
  if (metric.unit === 'paise') return moneyPaise(metric.value);
  if (metric.unit === 'percent') return numberValue(metric.value, '%');
  if (metric.unit === 'minutes') return numberValue(metric.value, ' min');
  return numberValue(metric.value);
}

function comparisonLabel(metric: MetricValue) {
  if (metric.comparison === 'new') return 'New / no comparison';
  if (metric.comparison === 'no-comparison' || metric.changePct === null) return 'No comparison';
  return `${metric.changePct > 0 ? '+' : ''}${metric.changePct.toFixed(1)}% vs previous`;
}

function absoluteChangeLabel(metric: MetricValue) {
  if (metric.value === null || metric.previous === null) return null;
  const difference = metric.value - metric.previous;
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  const magnitude = Math.abs(difference);
  const value = metric.unit === 'paise'
    ? moneyPaise(magnitude)
    : metric.unit === 'percent'
      ? `${numberValue(magnitude)} percentage points`
      : metric.unit === 'minutes'
        ? `${numberValue(magnitude)} min`
        : numberValue(magnitude);
  return `${sign}${value} absolute · previous ${metricDisplay({ ...metric, value: metric.previous })}`;
}

function businessDateTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

function SectionHeading({ id, eyebrow, title, description, icon: Icon, trailing }: {
  id: string; eyebrow: string; title: string; description: string; icon: LucideIcon; trailing?: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF8C00]"><Icon className="h-4 w-4" aria-hidden="true" />{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black text-white">{title}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
      {trailing}
    </div>
  );
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl border border-white/10 p-4 sm:p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {note && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, metric, icon: Icon, caution = false }: { label: string; metric: MetricValue; icon: LucideIcon; caution?: boolean }) {
  const change = comparisonLabel(metric);
  const absoluteChange = absoluteChangeLabel(metric);
  const hasPercent = metric.comparison === 'percent' && metric.changePct !== null;
  return (
    <article className="glass min-w-0 rounded-2xl border border-white/10 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-xl border p-2 ${caution ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-[#FF8C00]/20 bg-[#FF8C00]/10 text-[#FF8C00]'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className={`max-w-[8rem] text-right text-[10px] font-semibold ${hasPercent && metric.changePct! > 0 ? 'text-emerald-400' : hasPercent && metric.changePct! < 0 ? 'text-red-300' : 'text-gray-600'}`}>{change}</span>
      </div>
      <p className="mt-4 break-words text-xl font-black text-white sm:text-2xl">{metricDisplay(metric)}</p>
      <h3 className="mt-1 text-xs font-semibold text-gray-400">{label}</h3>
      {absoluteChange && <p className="mt-1 text-[10px] text-gray-600">{absoluteChange}</p>}
      {metric.coveragePct !== undefined && <p className="mt-2 text-[10px] text-gray-600">Coverage: {metric.coveragePct.toFixed(1)}%</p>}
      {metric.note && <p className="mt-2 text-[10px] leading-relaxed text-gray-600">{metric.note}</p>}
    </article>
  );
}

function HorizontalBars({ rows, valueLabel }: { rows: Array<{ key: string; label: string; value: number }>; valueLabel: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <Empty text="No matching data for this period." />;
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate text-gray-400" title={row.label}>{row.label}</span><span className="shrink-0 font-semibold text-gray-200">{valueLabel(row.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`${row.label}: ${valueLabel(row.value)}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#FF4500] to-[#FFD700]" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-gray-600">{text}</div>;
}

function TrendChart({ trend, timeZone }: { trend: TrendPoint[]; timeZone: string }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => setSelectedKey(null), [trend]);
  const selected = trend.find(point => point.key === selectedKey) ?? null;
  const max = Math.max(1, ...trend.map(point => point.invoiceTotalPaise));
  if (!trend.length) return <Empty text="No sales buckets match this period." />;
  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex h-52 min-w-[36rem] items-end gap-2 border-b border-white/10 px-1" role="group" aria-label="Invoice totals by period. Select a bar for a detailed breakdown.">
          {trend.map(point => {
            const height = Math.max(point.invoiceTotalPaise > 0 ? 3 : 1, (point.invoiceTotalPaise / max) * 100);
            return (
              <button key={point.key} type="button" onClick={() => setSelectedKey(current => current === point.key ? null : point.key)} aria-pressed={selectedKey === point.key} aria-label={`${point.label}: ${moneyPaise(point.invoiceTotalPaise)}, ${point.orders} orders`} className="group flex h-full min-w-10 flex-1 flex-col items-center justify-end rounded-t focus:outline-none focus:ring-2 focus:ring-[#FFD700]">
                <span className="mb-1 text-[9px] font-semibold text-gray-600 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">{point.orders}</span>
                <span className={`w-full rounded-t-md bg-gradient-to-t from-[#FF4500] to-[#FFD700] transition ${selectedKey === point.key ? 'brightness-125 ring-1 ring-[#FFD700]' : 'opacity-80 group-hover:opacity-100'}`} style={{ height: `${height}%` }} />
                <span className="mt-2 max-w-16 truncate text-[9px] text-gray-600" title={point.label}>{point.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="mt-4 rounded-xl border border-[#FF8C00]/20 bg-[#FF8C00]/5 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-white">{selected.label} drill-down</p><button type="button" onClick={() => setSelectedKey(null)} className="text-[10px] text-gray-500 hover:text-white">Clear</button></div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><dt className="text-gray-600">Orders</dt><dd className="mt-1 text-gray-200">{selected.orders}</dd></div>
            <div><dt className="text-gray-600">Merchandise</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.merchandiseSalesPaise)}</dd></div>
            <div><dt className="text-gray-600">Discounts</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.discountsPaise)}</dd></div>
            <div><dt className="text-gray-600">Tax</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.taxPaise)}</dd></div>
            <div><dt className="text-gray-600">Delivery</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.deliveryPaise)}</dd></div>
            <div><dt className="text-gray-600">Invoice total</dt><dd className="mt-1 font-semibold text-[#FFB347]">{moneyPaise(selected.invoiceTotalPaise)}</dd></div>
            <div><dt className="text-gray-600">Collected</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.collectedPaise)}</dd></div>
            <div><dt className="text-gray-600">Refunded</dt><dd className="mt-1 text-gray-200">{moneyPaise(selected.refundedPaise)}</dd></div>
          </dl>
        </div>
      )}
      <details className="mt-4 rounded-xl border border-white/5 bg-black/10">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">Accessible chart data</summary>
        <div className="overflow-x-auto border-t border-white/5">
          <table className="min-w-full text-left text-xs">
            <thead><tr className="text-gray-600"><th className="px-4 py-2">Period</th><th className="px-4 py-2">Orders</th><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Collected</th><th className="px-4 py-2">Refunded</th></tr></thead>
            <tbody>{trend.map(point => <tr key={point.key} className="border-t border-white/5 text-gray-300"><td className="px-4 py-2">{point.label}</td><td className="px-4 py-2">{point.orders}</td><td className="px-4 py-2">{moneyPaise(point.invoiceTotalPaise)}</td><td className="px-4 py-2">{moneyPaise(point.collectedPaise)}</td><td className="px-4 py-2">{moneyPaise(point.refundedPaise)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="mt-3 text-[10px] text-gray-600">Buckets use {timeZone}; timestamps are stored in UTC and the range end is exclusive.</p>
    </div>
  );
}

function Filters({ draft, setDraft, data, loading, onSubmit, onReset }: {
  draft: FilterDraft; setDraft: (next: FilterDraft) => void; data: AnalyticsSnapshot | null; loading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void;
}) {
  const products = useMemo(() => {
    const values = new Map<string, string>();
    data?.products.rows.forEach(row => { if (row.productId) values.set(row.productId, row.productName); });
    return [...values.entries()];
  }, [data]);
  const variants = useMemo(() => data?.products.rows.filter(row => !draft.productId || row.productId === draft.productId).filter(row => row.variantId).map(row => [row.variantId, row.variantName] as const) ?? [], [data, draft.productId]);
  const categories = useMemo(() => {
    const values = new Map<string, string>();
    data?.products.categories.forEach(row => { if (row.categoryId) values.set(row.categoryId, row.categoryName); });
    return [...values.entries()];
  }, [data]);
  const selectClass = 'mt-1.5 w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF8C00]';
  return (
    <form onSubmit={onSubmit} className="glass rounded-2xl border border-white/10 p-4 sm:p-5" aria-label="Analytics filters">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-sm font-bold text-white"><Filter className="h-4 w-4 text-[#FF8C00]" /> Filters</h2><p className="mt-1 text-[11px] text-gray-600">Filters apply to every metric, table, and export.</p></div>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-white/5 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <label className="text-[11px] font-semibold text-gray-500">Date preset
          <select value={draft.preset} onChange={event => setDraft({ ...draft, preset: event.target.value as DatePreset })} className={selectClass}>{DATE_PRESETS.map(value => <option key={value} value={value}>{PRESET_LABELS[value]}</option>)}</select>
        </label>
        {draft.preset === 'custom' && <>
          <label className="text-[11px] font-semibold text-gray-500">Start date
            <input required type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} className={selectClass} />
          </label>
          <label className="text-[11px] font-semibold text-gray-500">End date (exclusive)
            <input required type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} className={selectClass} />
          </label>
        </>}
        <label className="text-[11px] font-semibold text-gray-500">Group trend by
          <select value={draft.group} onChange={event => setDraft({ ...draft, group: event.target.value as Granularity })} className={selectClass}>{GRANULARITIES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Product
          <select value={draft.productId} onChange={event => setDraft({ ...draft, productId: event.target.value, variantId: '' })} className={selectClass}><option value="">All products</option>{products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Variant
          <select value={draft.variantId} onChange={event => setDraft({ ...draft, variantId: event.target.value })} className={selectClass}><option value="">All variants</option>{variants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Category
          <select value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })} className={selectClass}><option value="">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Coupon code
          <input value={draft.couponCode} onChange={event => setDraft({ ...draft, couponCode: event.target.value.toUpperCase() })} maxLength={40} placeholder="All coupons" className={selectClass} />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Token or order
          <input value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} maxLength={80} placeholder="SC-0042 or order ID" className={selectClass} />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Serving worker ID
          <input value={draft.workerId} onChange={event => setDraft({ ...draft, workerId: event.target.value })} maxLength={80} placeholder="All workers" className={selectClass} />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Order statuses <span className="font-normal text-gray-700">(multi-select)</span>
          <select multiple value={draft.statuses} onChange={event => setDraft({ ...draft, statuses: Array.from(event.target.selectedOptions, option => option.value as OrderStatus) })} className={`${selectClass} h-[6.4rem] capitalize`}>{ORDER_STATUSES.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Payment methods <span className="font-normal text-gray-700">(multi-select)</span>
          <select multiple value={draft.paymentMethods} onChange={event => setDraft({ ...draft, paymentMethods: Array.from(event.target.selectedOptions, option => option.value as PaymentMethod) })} className={`${selectClass} h-[6.4rem] capitalize`}>{PAYMENT_METHODS.map(value => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">Payment statuses <span className="font-normal text-gray-700">(multi-select)</span>
          <select multiple value={draft.paymentStatuses} onChange={event => setDraft({ ...draft, paymentStatuses: Array.from(event.target.selectedOptions, option => option.value as PaymentStatus) })} className={`${selectClass} h-[6.4rem] capitalize`}>{PAYMENT_STATUSES.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
        </label>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-5 py-2.5 text-xs font-bold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#FFD700] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}{loading ? 'Applying…' : 'Apply filters'}</button></div>
    </form>
  );
}

export default function AdminDashboard() {
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dataset, setDataset] = useState<AnalyticsTableName>('orders');

  const load = useCallback(async (filters: FilterDraft, preserve = false) => {
    if (preserve) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const snapshot = await apiRequest<AnalyticsSnapshot>(`/api/admin/analytics?${dashboardParams(filters).toString()}`);
      setData(snapshot);
      setApplied(filters);
    } catch (loadError) {
      setError(readableError(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(DEFAULT_FILTERS); }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(draft, Boolean(data));
  }

  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    void load(DEFAULT_FILTERS, Boolean(data));
  }

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[96rem] space-y-5" aria-busy="true" aria-label="Loading business analytics">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-56 animate-pulse rounded-2xl bg-white/5" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-white/5" />)}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[24rem] max-w-xl flex-col items-center justify-center text-center" role="alert">
        <span className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4"><AlertTriangle className="h-8 w-8 text-red-300" /></span>
        <h1 className="mt-5 text-xl font-bold text-white">Business analytics are unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{error}</p>
        <button type="button" onClick={() => void load(applied)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF4500] px-5 py-2.5 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" /> Retry</button>
      </div>
    );
  }

  const filters = data.meta.filters;
  const activeFilterCount = filters.statuses.length + filters.paymentMethods.length + filters.paymentStatuses.length + [filters.productId, filters.variantId, filters.categoryId, filters.couponCode, filters.workerId, filters.search].filter(Boolean).length;
  const inventoryProblems = data.tables.inventory.filter(row => row.stockStatus !== 'in_stock');
  const sortedProducts = [...data.products.rows].sort((left, right) => right.unitsSold - left.unitsSold);
  const topProducts = sortedProducts.slice(0, 6);
  const slowProducts = [...data.products.rows].filter(row => row.manuallyAvailable !== false)
    .sort((left, right) => left.unitsSold - right.unitsSold || left.productName.localeCompare(right.productName)).slice(0, 6);
  const highestSalesProducts = [...data.products.rows].sort((left, right) => right.merchandiseSalesPaise - left.merchandiseSalesPaise).slice(0, 6);
  const highestProfitProducts = [...data.products.rows].filter(row => row.grossMarginPaise != null)
    .sort((left, right) => Number(right.grossMarginPaise) - Number(left.grossMarginPaise)).slice(0, 6);
  const selectedMetricDefinition = (id: string) => data.definitions.find(definition => definition.id === id);

  return (
    <div className="mx-auto max-w-[96rem] space-y-10 pb-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#FF8C00]"><Flame className="h-4 w-4" /> SHATVIKA CORNER</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Business command centre</h1>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">Authorized operational and financial analysis from recorded order, payment, inventory, customer, coupon, and feedback data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#reports" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" /> Reports</a>
          <button type="button" onClick={() => void load(applied, true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-gray-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span><strong className="text-gray-200">Last refreshed:</strong> {businessDateTime(data.meta.lastRefreshedAt, data.meta.timeZone)} · <strong className="text-gray-200">As of:</strong> {businessDateTime(data.meta.asOfUtc, data.meta.timeZone)}</span></div>
        <div className="text-gray-500"><span className="text-gray-300">{data.meta.range.label}</span> · {data.meta.timeZone} · end-exclusive · {activeFilterCount} additional filter{activeFilterCount === 1 ? '' : 's'}</div>
        <div className="text-gray-500"><strong className="text-gray-300">Comparison:</strong> {businessDateTime(data.meta.comparisonRange.fromUtc, data.meta.timeZone)} to {businessDateTime(data.meta.comparisonRange.toExclusiveUtc, data.meta.timeZone)} (end-exclusive)</div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-xs text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Refresh failed; the previous verified snapshot remains visible. {error}</div>}

      <Filters draft={draft} setDraft={setDraft} data={data} loading={refreshing} onSubmit={applyFilters} onReset={resetFilters} />

      <nav aria-label="Dashboard sections" className="sticky top-0 z-20 -mx-2 overflow-x-auto border-y border-white/5 bg-[#0a0a0a]/90 px-2 py-3 backdrop-blur-xl">
        <div className="flex min-w-max gap-1">{SECTION_LINKS.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">{label}</a>)}</div>
      </nav>

      <section className="space-y-5">
        <SectionHeading id="overview" eyebrow="Overview" title="What is happening now" description="Sales components, collections, receivables, refunds, customers, fulfilment, and stock are kept separate so the totals remain reconcilable." icon={BarChart3} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Order volume" metric={data.overview.orderVolume} icon={ShoppingBag} />
          <MetricCard label="Fulfilled orders" metric={data.overview.deliveredOrders} icon={CheckCircle2} />
          <MetricCard label="Cancelled orders" metric={data.overview.cancelledOrders} icon={AlertTriangle} caution />
          <MetricCard label="Gross merchandise sales" metric={data.overview.merchandiseSales} icon={IndianRupee} />
          <MetricCard label="Net merchandise sales" metric={data.overview.netMerchandiseSales} icon={ReceiptIndianRupee} />
          <MetricCard label="Collected payments" metric={data.overview.collectedPayments} icon={WalletCards} />
          <MetricCard label="Outstanding payments" metric={data.overview.outstandingPayments} icon={CircleDollarSign} caution />
          <MetricCard label="Recorded refunds" metric={data.overview.refunds} icon={RotateCcw} caution />
          <MetricCard label="Average order value" metric={data.overview.averageOrderValue} icon={BarChart3} />
          <MetricCard label="Unique purchasing customers" metric={data.overview.uniqueCustomers} icon={Users} />
          <MetricCard label="New customers" metric={data.overview.newCustomers} icon={Users} />
          <MetricCard label="Returning customers" metric={data.overview.returningCustomers} icon={Users} />
          <MetricCard label="Inventory alerts" metric={data.overview.inventoryAlerts} icon={Boxes} caution />
          <MetricCard label="Actual gross margin" metric={data.overview.grossMargin} icon={IndianRupee} />
          <MetricCard label="Tax on fulfilled sales" metric={data.overview.taxCollected} icon={ReceiptIndianRupee} />
          <MetricCard label="Units sold" metric={data.overview.unitsSold} icon={PackageSearch} />
          <MetricCard label="Current pending queue" metric={data.overview.pendingOrders} icon={Clock3} caution />
          <MetricCard label="Cost of goods sold" metric={data.overview.costOfGoodsSold} icon={Boxes} />
          <MetricCard label="Recorded operating expenses" metric={data.overview.operatingExpenses} icon={WalletCards} caution />
          <MetricCard label="Recorded-expense net profit" metric={data.overview.recordedNetProfit} icon={IndianRupee} />
          <MetricCard label="Finalized net profit" metric={data.overview.finalizedNetProfit} icon={CheckCircle2} />
          <MetricCard label="Average preparation" metric={data.overview.averagePreparationMinutes} icon={Clock3} />
          <MetricCard label="Ready-to-collection wait" metric={data.overview.averageCollectionWaitMinutes} icon={Clock3} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading id="sales" eyebrow="Sales" title="Demand and reconciliation" description="Invoice components and payment movements are visible independently. Sales are based on the selected order cohort; payment events use their recorded event time where available." icon={IndianRupee} />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <Panel title={`Sales trend · ${filters.group}`} note="Select a bar for merchandise, discount, tax, delivery, collection, and refund details."><TrendChart trend={data.sales.trend} timeZone={data.meta.timeZone} /></Panel>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <Panel title="Basket size" note="Null when no eligible orders exist."><dl className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[0.025] p-4"><dt className="text-[10px] text-gray-600">Items per order</dt><dd className="mt-2 text-xl font-black text-white">{numberValue(data.sales.averageItemsPerOrder)}</dd></div><div className="rounded-xl bg-white/[0.025] p-4"><dt className="text-[10px] text-gray-600">Lines per order</dt><dd className="mt-2 text-xl font-black text-white">{numberValue(data.sales.averageLinesPerOrder)}</dd></div></dl></Panel>
            <Panel title="Order status mix"><HorizontalBars rows={data.sales.statuses.map(row => ({ key: row.status, label: row.status.replaceAll('_', ' '), value: row.orders }))} valueLabel={value => `${value} orders`} /></Panel>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title="Weekday demand" note={`Grouped in ${data.meta.timeZone}.`}><HorizontalBars rows={data.sales.weekdays.map(row => ({ key: String(row.key), label: row.label, value: row.orders }))} valueLabel={value => `${value}`} /></Panel>
          <Panel title="Hourly demand" note="Recorded order placement hour; zero hours remain visible."><HorizontalBars rows={data.sales.hours.map(row => ({ key: String(row.hour), label: `${String(row.hour).padStart(2, '0')}:00`, value: row.orders }))} valueLabel={value => `${value}`} /></Panel>
          <Panel title="Payment method reconciliation" note="Invoice totals by recorded method; this does not imply collection."><HorizontalBars rows={data.sales.paymentMethods.map(row => ({ key: row.method, label: row.method, value: row.invoiceTotalPaise }))} valueLabel={moneyPaise} /></Panel>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading id="products" eyebrow="Products" title="Menu contribution and inventory" description="Products and categories use stable IDs and order-time snapshots. Stockouts come from quantity; manually disabled items remain a separate state." icon={PackageSearch} trailing={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-gray-500">Cost coverage {data.dataQuality.costCoveragePct.toFixed(1)}%</span>} />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <Panel title="Best sellers" note="Ranked by recorded units sold."><HorizontalBars rows={topProducts.map(row => ({ key: `${row.productId}:${row.variantId}`, label: `${row.productName}${row.variantName ? ` · ${row.variantName}` : ''}`, value: row.unitsSold }))} valueLabel={value => `${value} units`} /></Panel>
          <Panel title="Slow available sellers" note="Available-but-unsold items remain distinct from disabled items."><HorizontalBars rows={slowProducts.map(row => ({ key: `${row.productId}:${row.variantId}`, label: `${row.productName}${row.variantName ? ` · ${row.variantName}` : ''}`, value: row.unitsSold }))} valueLabel={value => `${value} units`} /></Panel>
          <Panel title="Highest sales" note="Order-time merchandise value before discount."><HorizontalBars rows={highestSalesProducts.map(row => ({ key: `${row.productId}:${row.variantId}`, label: row.productName, value: row.merchandiseSalesPaise }))} valueLabel={moneyPaise} /></Panel>
          <Panel title="Highest gross profit" note="Only products with complete immutable cost coverage."><HorizontalBars rows={highestProfitProducts.map(row => ({ key: `${row.productId}:${row.variantId}`, label: row.productName, value: Number(row.grossMarginPaise) }))} valueLabel={moneyPaise} /></Panel>
          <Panel title="Category contribution" note="Unavailable historical categories remain in the explicit unknown bucket."><HorizontalBars rows={data.products.categories.slice(0, 8).map(row => ({ key: row.categoryId, label: row.categoryName, value: row.merchandiseSalesPaise }))} valueLabel={moneyPaise} /></Panel>
        </div>
        <Panel title="Frequently purchased combinations" note="Only pairs recorded together in at least two fulfilled orders are shown. Association is not causation."><HorizontalBars rows={data.products.combinations.map(row => ({ key: row.productIds.join(':'), label: row.productNames.join(' + '), value: row.orders }))} valueLabel={value => `${value} orders`} /></Panel>
        <Panel title="Inventory alerts" note="Low/out-of-stock quantity and manual availability are not conflated.">
          {inventoryProblems.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{inventoryProblems.slice(0, 12).map(row => <div key={row.productId} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/10 bg-amber-400/5 p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-gray-200">{row.productName}</p><p className="mt-1 truncate text-[10px] text-gray-600">{row.categoryName} · {row.stockStatus.replaceAll('_', ' ')}</p></div><span className="shrink-0 text-sm font-black text-amber-300">{row.quantity}</span></div>)}</div> : <Empty text="No current low-stock, out-of-stock, or manually disabled products." />}
        </Panel>
        {data.overview.grossMargin.value === null && <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/75"><strong>Cost data required.</strong> Gross margin is withheld until immutable order-time cost coverage reaches 100%. Product cost edits do not create historical cost or rewrite past orders.</div>}
      </section>

      <section className="space-y-5">
        <SectionHeading id="customers" eyebrow="Customers" title="Acquisition and repeat purchasing" description="New versus returning status checks delivered purchase history before the selected period, rather than only orders inside it. Dashboard rows omit email and phone." icon={Users} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Panel title="Repeat-purchase rate"><p className="text-2xl font-black text-white">{numberValue(data.customers.repeatPurchaseRatePct, '%')}</p></Panel>
          <Panel title="Purchase frequency"><p className="text-2xl font-black text-white">{numberValue(data.customers.purchaseFrequency)}</p><p className="mt-1 text-[10px] text-gray-600">Delivered purchases per customer</p></Panel>
          <Panel title="Cohort retention"><p className="text-sm font-bold text-gray-300">{data.customers.cohortStatus === 'available' ? 'Available' : 'Insufficient data'}</p><p className="mt-2 text-[10px] leading-relaxed text-gray-600">No retention claim is shown without adequate longitudinal history.</p></Panel>
          <Panel title="Snapshot coverage"><p className="text-2xl font-black text-white">{data.dataQuality.customerSnapshotCoveragePct.toFixed(1)}%</p><p className="mt-1 text-[10px] text-gray-600">Immutable customer details on eligible historical orders</p></Panel>
        </div>
        <Panel title="Customer value drill-down" note="Historical value is observed delivered merchandise sales, not a forecast.">
          {data.customers.rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="text-gray-600"><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Segment</th><th className="px-3 py-2">Period orders</th><th className="px-3 py-2">Lifetime delivered</th><th className="px-3 py-2">Observed value</th></tr></thead><tbody>{data.customers.rows.map(row => <tr key={row.customerId} className="border-t border-white/5 text-gray-300"><td className="px-3 py-3 font-semibold text-white">{row.customerName}</td><td className="px-3 py-3 capitalize">{row.segment}</td><td className="px-3 py-3">{row.orderCount}</td><td className="px-3 py-3">{row.lifetimeDeliveredOrders}</td><td className="px-3 py-3 text-[#FFB347]">{moneyPaise(row.merchandiseSalesPaise)}</td></tr>)}</tbody></table></div> : <Empty text="No purchasing customers match this period." />}
        </Panel>
      </section>

      <section className="space-y-5">
        <SectionHeading id="operations" eyebrow="Operations" title="Queue health and fulfilment" description="Durations use recorded timestamps only. Missing stage events are excluded rather than replaced with promised delivery estimates." icon={Clock3} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Panel title="Preparation time"><p className="text-2xl font-black text-white">{numberValue(data.operations.averagePreparationMinutes, ' min')}</p></Panel>
          <Panel title="Delivery time (legacy)"><p className="text-2xl font-black text-white">{numberValue(data.operations.averageDeliveryMinutes, ' min')}</p></Panel>
          <Panel title="Total fulfilment"><p className="text-2xl font-black text-white">{numberValue(data.operations.averageFulfilmentMinutes, ' min')}</p></Panel>
          <Panel title="Overdue now"><p className={`text-2xl font-black ${data.operations.overdueOrders > 0 ? 'text-red-300' : 'text-white'}`}>{data.operations.overdueOrders}</p></Panel>
          <Panel title="Uncollected active"><p className={`text-2xl font-black ${data.operations.uncollectedOrders > 0 ? 'text-amber-300' : 'text-white'}`}>{data.operations.uncollectedOrders}</p></Panel>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Current queue"><HorizontalBars rows={data.operations.queue.map(row => ({ key: row.status, label: row.status.replaceAll('_', ' '), value: row.orders }))} valueLabel={value => `${value} orders`} /></Panel>
          <Panel title="Cancellation reasons" note="Reasons are reported as recorded; missing reasons remain unknown."><HorizontalBars rows={data.operations.cancellationReasons.map(row => ({ key: row.reason, label: row.reason || 'Unknown', value: row.orders }))} valueLabel={value => `${value}`} /></Panel>
        </div>
        <Panel title="Oldest pending tokens" note="Oldest active counter and legacy orders as of the dashboard cutoff.">
          {data.operations.oldestPending.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="text-gray-600"><th className="px-3 py-2">Token / order</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Placed</th><th className="px-3 py-2">Overdue</th></tr></thead><tbody>{data.operations.oldestPending.map(row => <tr key={row.orderId} className="border-t border-white/5 text-gray-300"><td className="px-3 py-2 font-mono">{row.tokenNumber || row.orderId.slice(-8)}</td><td className="px-3 py-2 capitalize">{row.status.replaceAll('_', ' ')}</td><td className="px-3 py-2">{businessDateTime(row.placedAt, data.meta.timeZone)}</td><td className="px-3 py-2">{row.overdue ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div> : <Empty text="No active orders." />}
        </Panel>
        <p className="text-[10px] text-gray-600">Operational timestamp coverage: {data.dataQuality.operationalTimestampCoveragePct.toFixed(1)}%. Interpret averages alongside this coverage.</p>
      </section>

      <section className="space-y-5">
        <SectionHeading id="expenses" eyebrow="Expenses & profit" title="Recorded costs without invented profit" description="Order-time costs, active operating expenses, and completeness confirmations stay separate. Product and packaging cost is never counted again as operating expense." icon={CircleDollarSign} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Cost of goods sold" metric={data.overview.costOfGoodsSold} icon={Boxes} />
          <MetricCard label="Gross profit" metric={data.overview.grossMargin} icon={IndianRupee} />
          <MetricCard label="Operating expenses" metric={data.overview.operatingExpenses} icon={WalletCards} caution />
          <MetricCard label="Finalized net profit" metric={data.overview.finalizedNetProfit} icon={CheckCircle2} />
        </div>
        <div className={`rounded-xl border p-4 text-xs ${data.expenses.completenessConfirmed ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-100' : 'border-amber-400/20 bg-amber-400/5 text-amber-100'}`}>
          {data.expenses.completenessConfirmed ? 'Every included month is confirmed expense-complete.' : `Finalized net profit is suppressed. Confirm expense completeness for: ${data.expenses.requiredMonths.filter(month => !data.expenses.completeMonths.includes(month)).join(', ') || 'selected period'}.`}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading id="coupons" eyebrow="Coupons" title="Redemptions and discount exposure" description="Associated order value is descriptive. The dashboard does not claim coupon ROI or causal growth without incremental-cost or experiment data." icon={Tags} />
        <Panel title="Coupon performance">
          {data.coupons.rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="text-gray-600"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Redemptions</th><th className="px-3 py-2">Delivered</th><th className="px-3 py-2">Discounts</th><th className="px-3 py-2">Associated value</th><th className="px-3 py-2">Customers</th><th className="px-3 py-2">Repeat purchasers</th><th className="px-3 py-2">Recorded limit</th></tr></thead><tbody>{data.coupons.rows.map(row => <tr key={row.couponCode} className="border-t border-white/5 text-gray-300"><td className="px-3 py-3 font-bold text-white">{row.couponCode}</td><td className="px-3 py-3">{row.redemptions}</td><td className="px-3 py-3">{row.deliveredRedemptions}</td><td className="px-3 py-3">{moneyPaise(row.discountsPaise)}</td><td className="px-3 py-3 text-[#FFB347]">{moneyPaise(row.associatedOrderValuePaise)}</td><td className="px-3 py-3">{row.uniqueCustomers}</td><td className="px-3 py-3">{row.repeatPurchasers}</td><td className="px-3 py-3">{row.usageLimit ?? 'Unlimited'}</td></tr>)}</tbody></table></div> : <Empty text="No coupon usage matches this period." />}
        </Panel>
      </section>

      <section className="space-y-5">
        <SectionHeading id="feedback" eyebrow="Feedback" title="Ratings, moderation, and follow-up" description="Review quality signals and contact-message status are summarized without exposing public access to pending or rejected reviews." icon={Star} />
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title="Review score"><div className="flex items-end gap-3"><p className="text-4xl font-black text-white">{numberValue(data.feedback.averageRating)}</p><p className="pb-1 text-xs text-gray-600">from {data.feedback.reviewCount} reviews</p></div><div className="mt-4"><HorizontalBars rows={data.feedback.distribution.map(row => ({ key: String(row.rating), label: `${row.rating} star`, value: row.count }))} valueLabel={value => `${value}`} /></div></Panel>
          <Panel title="Low-rated products" note="Items with recorded low ratings; investigate context before acting."><HorizontalBars rows={data.feedback.lowRatedItems.map(row => ({ key: row.productId, label: row.productName, value: row.count }))} valueLabel={value => `${value} reviews`} /></Panel>
          <div className="grid gap-5">
            <Panel title="Moderation backlog"><p className={`text-3xl font-black ${data.feedback.moderationBacklog > 0 ? 'text-amber-300' : 'text-white'}`}>{data.feedback.moderationBacklog}</p><a href="/admin/reviews" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#FF8C00] hover:underline">Open moderation <ChevronRight className="h-3 w-3" /></a></Panel>
            <Panel title="Contact follow-up"><HorizontalBars rows={data.feedback.contactStatus.map(row => ({ key: row.status, label: row.status || 'Unknown', value: row.count }))} valueLabel={value => `${value}`} /></Panel>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading id="actions" eyebrow="Growth actions" title="Prioritized, evidence-linked next steps" description="Recommendations are deterministic prompts tied to measured signals. They do not guarantee growth and each states its limitation and metric to monitor." icon={Lightbulb} />
        {data.actions.length ? <div className="grid gap-4 lg:grid-cols-2">{data.actions.map(action => <article key={action.id} className="glass rounded-2xl border border-white/10 p-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${action.priority === 'high' ? 'bg-red-400/10 text-red-300' : action.priority === 'medium' ? 'bg-amber-400/10 text-amber-300' : 'bg-blue-400/10 text-blue-300'}`}>{action.priority} priority</span><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-gray-500">{action.confidence} confidence</span><span className="text-[10px] text-gray-600">{action.period}</span></div><h3 className="mt-4 text-sm font-bold text-white">{action.title}</h3><dl className="mt-4 space-y-3 text-xs leading-relaxed"><div><dt className="font-semibold text-gray-500">Evidence</dt><dd className="mt-1 text-gray-300">{action.evidence}</dd></div><div><dt className="font-semibold text-gray-500">Suggested action</dt><dd className="mt-1 text-gray-300">{action.suggestedAction}</dd></div><div><dt className="font-semibold text-gray-500">Limitation</dt><dd className="mt-1 text-gray-500">{action.limitation}</dd></div><div><dt className="font-semibold text-gray-500">Metric to monitor</dt><dd className="mt-1 text-[#FFB347]">{action.metricToMonitor}</dd></div></dl></article>)}</div> : <Empty text="Insufficient data for a measured recommendation in this period." />}
      </section>

      <section className="space-y-5">
        <SectionHeading id="details" eyebrow="Data explorer" title="Sortable, paginated details" description="Choose a dataset. Each table is queried server-side under the active authorization and filter scope; customer contact fields are minimized." icon={CalendarDays} />
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Analytics datasets">{(Object.keys(TABLE_LABELS) as AnalyticsTableName[]).map(value => <button key={value} type="button" role="tab" aria-selected={dataset === value} onClick={() => setDataset(value)} className={`min-w-max rounded-full border px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#FF8C00] ${dataset === value ? 'border-[#FF8C00]/50 bg-[#FF8C00]/10 text-white' : 'border-white/10 bg-white/[0.025] text-gray-500 hover:text-white'}`}>{TABLE_LABELS[value]}</button>)}</div>
        <ReportTable dataset={dataset} filters={filters} />
      </section>

      <ReportsPanel filters={filters} asOfUtc={data.meta.asOfUtc} periodLabel={data.meta.range.label} timeZone={data.meta.timeZone} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="quality-heading">
        <h2 id="quality-heading" className="text-sm font-bold text-white">Metric definitions and data limitations</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[['Cost snapshots', data.dataQuality.costCoveragePct], ['Category snapshots', data.dataQuality.categorySnapshotCoveragePct], ['Customer snapshots', data.dataQuality.customerSnapshotCoveragePct], ['Operational timestamps', data.dataQuality.operationalTimestampCoveragePct]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-black/20 p-3"><p className="text-[10px] text-gray-600">{label}</p><p className="mt-1 text-sm font-bold text-gray-300">{Number(value).toFixed(1)}% coverage</p></div>)}
        </div>
        <p className="mt-4 text-[11px] text-gray-600">Payment basis: {data.dataQuality.paymentTracking.replaceAll('-', ' ')} · Definitions version {data.meta.definitionsVersion}</p>
        {data.dataQuality.limitations.length > 0 && <ul className="mt-4 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-gray-500">{data.dataQuality.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>}
        <details className="mt-4 rounded-xl border border-white/5"><summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">Open metric dictionary ({data.definitions.length})</summary><div className="grid gap-3 border-t border-white/5 p-4 lg:grid-cols-2">{data.definitions.map(definition => <article key={definition.id} className="rounded-xl bg-black/20 p-4"><h3 className="text-xs font-bold text-gray-200">{definition.label}</h3><p className="mt-2 text-[11px] leading-relaxed text-gray-500">{definition.formula}</p><dl className="mt-3 space-y-1 text-[10px] text-gray-600"><div><dt className="inline font-semibold">Statuses: </dt><dd className="inline">{definition.includedStatuses}</dd></div><div><dt className="inline font-semibold">Timestamp: </dt><dd className="inline">{definition.timestampBasis}</dd></div><div><dt className="inline font-semibold">Refunds: </dt><dd className="inline">{definition.refundTreatment}</dd></div>{definition.denominator && <div><dt className="inline font-semibold">Denominator: </dt><dd className="inline">{definition.denominator}</dd></div>}{definition.limitation && <div><dt className="inline font-semibold">Limit: </dt><dd className="inline">{definition.limitation}</dd></div>}</dl></article>)}</div></details>
        <span className="sr-only">{selectedMetricDefinition('merchandise_sales')?.formula}</span>
      </section>
    </div>
  );
}
