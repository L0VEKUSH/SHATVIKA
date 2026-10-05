'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  CreditCard,
  MapPin,
  Package,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiClientError, apiRequest } from '@/lib/apiClient';
import { formatINR } from '@/lib/currency';

const PAGE_SIZE = 10;
const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || 'Asia/Kolkata';

type OrderStatus =
  | 'placed'
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'served'
  | 'cancelled';

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'partially_refunded' | 'refunded';

type OrderItem = {
  menuItemId: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  unitPricePaise?: number;
  totalPricePaise?: number;
  variantName?: string | null;
  categoryName?: string | null;
};

type StatusHistoryEntry = {
  fromStatus?: OrderStatus | null;
  status: OrderStatus;
  timestamp: string;
  actorType?: 'customer' | 'guest' | 'worker' | 'admin' | 'system';
  reason?: string | null;
  note?: string | null;
};

type DeliveryAddress = {
  label?: string | null;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
};

type CustomerOrder = {
  id: string;
  orderNumber: string;
  tokenNumber?: string | null;
  tokenBusinessDate?: string | null;
  fulfillmentType?: 'counter' | 'delivery' | null;
  fulfillmentLocationName?: string | null;
  items: OrderItem[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  deliveryCharge?: number;
  totalAmount: number;
  totalPaise?: number;
  paymentMethod: 'counter' | 'card' | 'upi' | 'wallet' | 'cash';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  stateVersion: number;
  statusHistory?: StatusHistoryEntry[];
  deliveryAddress?: DeliveryAddress;
  specialInstructions?: string | null;
  createdAt: string;
  estimatedDeliveryTime?: string | null;
  actualDeliveryTime?: string | null;
  estimatedReadyTime?: string | null;
  servedAt?: string | null;
  servedByName?: string | null;
  cancellationReason?: string | null;
  refundDuePaise?: number;
};

type OrdersResponse = {
  ok: true;
  orders: CustomerOrder[];
  total: number;
  page: number;
  pages: number;
  identity: 'guest' | 'google' | 'registered';
  historyScope: 'this_browser' | 'account';
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  served: 'Served',
  cancelled: 'Cancelled',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  placed: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  accepted: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  preparing: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  ready: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  out_for_delivery: 'border-blue-400/30 bg-blue-400/10 text-blue-300',
  delivered: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  served: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  cancelled: 'border-red-400/30 bg-red-400/10 text-red-300',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

const PAYMENT_METHOD_LABELS: Record<CustomerOrder['paymentMethod'], string> = {
  counter: 'Pay at counter',
  cash: 'Cash at counter',
  card: 'Card',
  upi: 'UPI',
  wallet: 'Wallet',
};

function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? 'Status unavailable';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

function rupees(paise: number | undefined, legacyRupees: number | undefined): number {
  if (Number.isSafeInteger(paise) && (paise ?? 0) >= 0) return (paise ?? 0) / 100;
  return Number.isFinite(legacyRupees) ? Number(legacyRupees) : 0;
}

function itemTotal(item: OrderItem): number {
  if (Number.isSafeInteger(item.totalPricePaise) && (item.totalPricePaise ?? 0) >= 0) {
    return (item.totalPricePaise ?? 0) / 100;
  }
  return Math.max(0, Number(item.unitPrice ?? 0)) * Math.max(0, Number(item.quantity ?? 0));
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : 'Orders could not be loaded. Please try again.';
  }
  const messages: Record<string, string> = {
    DATABASE_UNAVAILABLE: 'Orders are temporarily unavailable. Please try again.',
    STALE_ORDER_VERSION: 'This order changed before cancellation. It has been refreshed; please review it again.',
    INVALID_ORDER_TRANSITION: 'This order is no longer eligible for customer cancellation.',
    CANCELLATION_FAILED: 'The cancellation could not be completed. No changes were assumed.',
    TRANSACTION_DATABASE_REQUIRED: 'Cancellation is unavailable until transactional database support is restored.',
    VALIDATION_FAILED: 'Enter a cancellation reason between 3 and 300 characters.',
  };
  return messages[error.code] ?? error.message;
}

function OrderDetails({ order }: { order: CustomerOrder }) {
  const history = [...(order.statusHistory ?? [])]
    .filter((entry) => entry.timestamp && STATUS_LABELS[entry.status])
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const quantity = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

  return (
    <div id={`order-details-${order.id}`} className="border-t border-white/10 px-4 py-5 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <section aria-labelledby={`items-${order.id}`}>
          <h3 id={`items-${order.id}`} className="text-sm font-bold text-white">
            Items ({quantity})
          </h3>
          <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-black/10">
            {order.items.map((item, index) => (
              <li key={`${item.menuItemId}-${item.variantName ?? 'base'}-${index}`} className="flex gap-3 px-3 py-3 sm:px-4">
                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/5 px-2 text-xs font-bold text-gray-300" aria-label={`${item.quantity} quantity`}>
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-white">{item.name?.trim() || 'Historical item'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[item.variantName, item.categoryName].filter(Boolean).join(' · ') || 'Variant/category not recorded'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-200">{formatINR(itemTotal(item))}</p>
                  <p className="text-[10px] text-gray-500">{formatINR(rupees(item.unitPricePaise, item.unitPrice))} each</p>
                </div>
              </li>
            ))}
          </ul>

          {order.specialInstructions && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Special instructions</p>
              <p className="mt-1 break-words text-sm text-gray-300">{order.specialInstructions}</p>
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section aria-labelledby={`totals-${order.id}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h3 id={`totals-${order.id}`} className="text-sm font-bold text-white">Order totals</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4 text-gray-400"><dt>Merchandise</dt><dd>{formatINR(rupees(undefined, order.subtotal))}</dd></div>
              <div className="flex justify-between gap-4 text-gray-400"><dt>Discount</dt><dd>−{formatINR(rupees(undefined, order.discount))}</dd></div>
              <div className="flex justify-between gap-4 text-gray-400"><dt>Tax</dt><dd>{formatINR(rupees(undefined, order.tax))}</dd></div>
              {order.fulfillmentType === 'counter'
                ? <div className="flex justify-between gap-4 text-gray-400"><dt>Collection</dt><dd>Counter · no delivery fee</dd></div>
                : <div className="flex justify-between gap-4 text-gray-400"><dt>Delivery charge</dt><dd>{formatINR(rupees(undefined, order.deliveryCharge))}</dd></div>}
              <div className="flex justify-between gap-4 border-t border-white/10 pt-2 font-bold text-white"><dt>Total</dt><dd>{formatINR(rupees(order.totalPaise, order.totalAmount))}</dd></div>
            </dl>
            {Number.isSafeInteger(order.refundDuePaise) && Number(order.refundDuePaise) > 0 && (
              <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Refund due recorded: {formatINR(Number(order.refundDuePaise) / 100)}. This does not indicate that the refund has completed.
              </p>
            )}
          </section>

          <section aria-labelledby={`payment-${order.id}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h3 id={`payment-${order.id}`} className="flex items-center gap-2 text-sm font-bold text-white">
              <CreditCard className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" /> Payment
            </h3>
            <p className="mt-2 text-sm text-gray-300">{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? 'Method not recorded'}</p>
            <p className="mt-1 text-xs text-gray-500">{PAYMENT_LABELS[order.paymentStatus] ?? 'Status not recorded'}</p>
          </section>

          <section aria-labelledby={`address-${order.id}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <h3 id={`address-${order.id}`} className="flex items-center gap-2 text-sm font-bold text-white">
              <MapPin className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" /> {order.fulfillmentType === 'counter' ? 'Counter collection' : 'Delivery address'}
            </h3>
            {order.fulfillmentType === 'counter' ? (
              <div className="mt-2 text-sm leading-6 text-gray-300">
                <p className="font-semibold text-white">{order.fulfillmentLocationName || 'Shatvika Corner'}</p>
                <p>Delivery currently unavailable — collect at Shatvika Corner.</p>
                <p className="mt-2 text-amber-200">Show token {order.tokenNumber || order.orderNumber}, pay at the counter, and collect after it is marked ready.</p>
                {order.estimatedReadyTime && <p className="mt-1 text-xs text-gray-500">Initial preparation target: {formatDateTime(order.estimatedReadyTime)} (not a guarantee)</p>}
              </div>
            ) : order.deliveryAddress ? (
              <address className="mt-2 break-words text-sm not-italic leading-6 text-gray-300">
                {order.deliveryAddress.label && <span className="block font-semibold text-gray-200">{order.deliveryAddress.label}</span>}
                {order.deliveryAddress.street}<br />
                {order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.zipCode}<br />
                <span className="text-gray-500">Phone: {order.deliveryAddress.phone}</span>
              </address>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Historical address not recorded.</p>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby={`timeline-${order.id}`} className="mt-6">
        <h3 id={`timeline-${order.id}`} className="flex items-center gap-2 text-sm font-bold text-white">
          <Clock3 className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" /> Timestamped timeline
        </h3>
        {history.length > 0 ? (
          <ol className="mt-4 space-y-0">
            {history.map((entry, index) => (
              <li key={`${entry.status}-${entry.timestamp}-${index}`} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5 last:pb-0">
                {index < history.length - 1 && <span className="absolute left-[0.35rem] top-3 h-full w-px bg-white/10" aria-hidden="true" />}
                <span className="relative mt-1 h-3 w-3 rounded-full border-2 border-[#FF8C00] bg-[#141414]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-gray-200">{statusLabel(entry.status)}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(entry.timestamp)} · {entry.actorType === 'admin' ? 'Restaurant admin' : entry.actorType === 'worker' ? 'Counter worker' : entry.actorType === 'customer' || entry.actorType === 'guest' ? 'Customer' : 'System'}</p>
                  {entry.note && <p className="mt-1 break-words text-xs text-gray-400">{entry.note}</p>}
                  {entry.reason && <p className="mt-1 break-words text-xs text-gray-400">Reason: {entry.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-gray-500">
            No stage timestamps were recorded for this historical order. Order created {formatDateTime(order.createdAt)}.
          </div>
        )}
        {order.actualDeliveryTime && (
          <p className="mt-3 text-xs text-gray-500">Recorded delivery time: {formatDateTime(order.actualDeliveryTime)}</p>
        )}
        {order.servedAt && (
          <p className="mt-3 text-xs text-gray-500">Collected at counter: {formatDateTime(order.servedAt)}{order.servedByName ? ` · served by ${order.servedByName}` : ''}</p>
        )}
      </section>
    </div>
  );
}

export default function OrdersPage() {
  const { customer, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [historyScope, setHistoryScope] = useState<'this_browser' | 'account'>('this_browser');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const loadOrders = useCallback(async (targetPage: number, initial = false) => {
    const requestId = ++requestSequence.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const data = await apiRequest<OrdersResponse>(`/api/user/orders?page=${targetPage}&limit=${PAGE_SIZE}`, {
        cache: 'no-store',
      });
      if (requestId !== requestSequence.current) return;
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setPages(Math.max(1, data.pages ?? 1));
      setHistoryScope(data.historyScope ?? (customer ? 'account' : 'this_browser'));
      setLastRefreshed(new Date());
      if (targetPage > Math.max(1, data.pages ?? 1)) setPage(Math.max(1, data.pages ?? 1));
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      setError(errorMessage(caught));
      if (initial) setOrders([]);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [customer]);

  useEffect(() => {
    if (authLoading) return;
    void loadOrders(page, true);
  }, [authLoading, customer, loadOrders, page]);

  async function cancelOrder(event: FormEvent<HTMLFormElement>, order: CustomerOrder) {
    event.preventDefault();
    const reason = cancellationReason.trim();
    if (reason.length < 3 || reason.length > 300 || cancellingId) return;

    setCancellingId(order.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest<{ ok: true; order: { id: string; orderStatus: 'cancelled'; stateVersion: number } }>(
        `/api/user/orders/${encodeURIComponent(order.id)}`,
        {
          method: 'DELETE',
          body: { reason, expectedVersion: order.stateVersion },
        },
      );
      setCancelOrderId(null);
      setCancellationReason('');
      setNotice(`Order #${order.orderNumber} was cancelled. Its current payment/refund state is shown in the details.`);
      await loadOrders(page);
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiClientError && ['STALE_ORDER_VERSION', 'INVALID_ORDER_TRANSITION'].includes(caught.code)) {
        await loadOrders(page);
      }
    } finally {
      setCancellingId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center p-8" role="status" aria-live="polite">
        <RefreshCw className="h-8 w-8 animate-spin text-[#FF8C00]" aria-hidden="true" />
        <span className="sr-only">Loading orders</span>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white sm:text-3xl">
            <Package className="h-7 w-7 text-[#FF8C00] sm:h-8 sm:w-8" aria-hidden="true" />
            My orders
          </h1>
          <p className="mt-1 text-sm text-gray-400">Saved order details, payment status, and recorded stage history.</p>
          {historyScope === 'this_browser' && (
            <p className="mt-2 max-w-2xl rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              Guest history is private to this browser. It may be lost if browser data is cleared or this guest session expires; it is not available across devices.
            </p>
          )}
          {lastRefreshed && <p className="mt-1 text-xs text-gray-600">Last refreshed {formatDateTime(lastRefreshed.toISOString())} ({BUSINESS_TIME_ZONE})</p>}
        </div>
        <button
          type="button"
          onClick={() => void loadOrders(page)}
          disabled={refreshing || Boolean(cancellingId)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-[#FF8C00]/40 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Refreshing…' : 'Refresh orders'}
        </button>
      </header>

      <div className="mt-5 space-y-3" aria-live="polite">
        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 underline underline-offset-2">Dismiss</button>
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
            {notice}
          </div>
        )}
      </div>

      {!error && orders.length === 0 ? (
        <section className="glass mt-6 rounded-2xl p-8 text-center sm:p-12">
          <Package className="mx-auto h-12 w-12 text-white/20" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-white">No orders yet</h2>
          <p className="mt-2 text-sm text-gray-400">Your completed checkout orders will appear here.</p>
          <Link href="/#menu" className="btn-flame mt-6 inline-flex px-6 py-3">
            <span>Explore menu</span>
          </Link>
        </section>
      ) : (
        <section className="mt-6" aria-label="Order history">
          <p className="mb-3 text-xs text-gray-500">{total} {total === 1 ? 'order' : 'orders'} in your history</p>
          <div className="space-y-4">
            {orders.map((order) => {
              const expanded = expandedId === order.id;
              const cancelling = cancellingId === order.id;
              const canCancel = ['placed', 'pending', 'accepted'].includes(order.orderStatus);
              const quantity = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

              return (
                <article key={order.id} aria-labelledby={`order-${order.id}`} className="glass overflow-hidden rounded-2xl">
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 id={`order-${order.id}`} className="break-all text-2xl font-black text-orange-400 sm:text-3xl">
                          {order.fulfillmentType === 'counter' ? `Token ${order.tokenNumber || order.orderNumber}` : `Order #${order.orderNumber || order.id.slice(-8)}`}
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">Placed {formatDateTime(order.createdAt)}</p>
                      </div>
                      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[order.orderStatus] ?? 'border-white/10 bg-white/5 text-gray-300'}`}>
                        {statusLabel(order.orderStatus)}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-black/10 p-3 sm:grid-cols-4">
                      <div><p className="text-[11px] uppercase tracking-wider text-gray-600">Items</p><p className="mt-1 text-sm font-semibold text-gray-200">{quantity}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-gray-600">Total</p><p className="mt-1 text-sm font-bold text-white">{formatINR(rupees(order.totalPaise, order.totalAmount))}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-gray-600">Method</p><p className="mt-1 text-sm font-semibold text-gray-200">{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? 'Not recorded'}</p></div>
                      <div><p className="text-[11px] uppercase tracking-wider text-gray-600">Payment</p><p className="mt-1 text-sm font-semibold text-gray-200">{PAYMENT_LABELS[order.paymentStatus] ?? 'Not recorded'}</p></div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`order-details-${order.id}`}
                        onClick={() => setExpandedId(expanded ? null : order.id)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/5"
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                        {expanded ? 'Hide details' : 'View details and timeline'}
                      </button>
                      {canCancel && cancelOrderId !== order.id && (
                        <button
                          type="button"
                          disabled={Boolean(cancellingId)}
                          onClick={() => {
                            setCancelOrderId(order.id);
                            setCancellationReason('');
                            setNotice(null);
                          }}
                          className="min-h-11 rounded-xl border border-red-400/25 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
                        >
                          Request cancellation
                        </button>
                      )}
                    </div>

                    {cancelOrderId === order.id && canCancel && (
                      <form onSubmit={(event) => void cancelOrder(event, order)} className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4">
                        <label htmlFor={`cancel-reason-${order.id}`} className="text-sm font-bold text-red-100">Cancellation reason</label>
                        <p id={`cancel-help-${order.id}`} className="mt-1 text-xs text-gray-400">
                          Cancellation is submitted against the current order version and succeeds only if the order is still eligible.
                        </p>
                        <textarea
                          id={`cancel-reason-${order.id}`}
                          value={cancellationReason}
                          onChange={(event) => setCancellationReason(event.target.value)}
                          minLength={3}
                          maxLength={300}
                          required
                          rows={3}
                          aria-describedby={`cancel-help-${order.id}`}
                          className="input-flame mt-3 resize-y"
                          placeholder="Tell us why you need to cancel"
                          disabled={cancelling}
                        />
                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <button
                            type="button"
                            disabled={cancelling}
                            onClick={() => {
                              setCancelOrderId(null);
                              setCancellationReason('');
                            }}
                            className="min-h-11 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-50"
                          >
                            Keep order
                          </button>
                          <button
                            type="submit"
                            disabled={cancelling || cancellationReason.trim().length < 3}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {cancelling && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
                          </button>
                        </div>
                      </form>
                    )}

                    {order.orderStatus === 'cancelled' && order.cancellationReason && (
                      <p className="mt-4 break-words rounded-xl bg-red-400/[0.06] px-4 py-3 text-xs text-gray-400">
                        Cancellation reason: {order.cancellationReason}
                      </p>
                    )}
                  </div>
                  {expanded && <OrderDetails order={order} />}
                </article>
              );
            })}
          </div>

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Order history pages">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || refreshing || Boolean(cancellingId)}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </button>
              <span className="text-xs text-gray-500">Page {page} of {pages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                disabled={page >= pages || refreshing || Boolean(cancellingId)}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      )}
    </main>
  );
}
