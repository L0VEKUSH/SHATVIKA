'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, apiRequest, clearApiClientSession } from '@/lib/apiClient';

type CounterStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';
type QueueOrder = {
  id: string;
  tokenNumber: string;
  tokenBusinessDate: string;
  createdAt: string;
  estimatedReadyTime?: string | null;
  items: { name: string; variantName?: string; quantity: number; unitPricePaise: number; totalPricePaise: number }[];
  specialInstructions?: string | null;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  collectedPaise: number;
  refundedPaise: number;
  refundDuePaise: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: CounterStatus;
  stateVersion: number;
  cancellationReason?: string | null;
};
type QueueResponse = { ok: true; orders: QueueOrder[]; total: number; businessDate: string; lastRefreshedAt: string };
type PaymentDraft = { method: 'cash' | 'upi'; transactionReference: string; merchantReceiptVerified: boolean };

const nextAction: Partial<Record<CounterStatus, { status: CounterStatus; label: string }>> = {
  placed: { status: 'accepted', label: 'Accept order' },
  accepted: { status: 'preparing', label: 'Start preparing' },
  preparing: { status: 'ready', label: 'Mark ready' },
  ready: { status: 'served', label: 'Mark served' },
};

const statusLabel: Record<CounterStatus, string> = {
  placed: 'Placed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', served: 'Served', cancelled: 'Cancelled',
};

function todayInBusinessTime() {
  const timeZone = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

function friendlyError(error: unknown) {
  if (!(error instanceof ApiClientError)) return 'The action failed. Retry when the connection is stable.';
  const messages: Record<string, string> = {
    STALE_ORDER_VERSION: 'Another worker updated this order. The queue has been refreshed.',
    PAYMENT_REQUIRED_BEFORE_SERVING: 'Payment must be verified before this order can be served.',
    INVALID_ORDER_TRANSITION: 'This status change is no longer allowed. Refresh and check the latest state.',
    UPI_RECEIPT_VERIFICATION_REQUIRED: 'Verify the UPI receipt in the merchant payment source and enter its reference.',
    FULL_COUNTER_PAYMENT_REQUIRED: 'Record the full outstanding amount in one verified counter collection.',
    PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING: 'This order is already paid or the amount exceeds its balance.',
  };
  return messages[error.code] ?? 'The action was not saved. The order is unchanged; retry after refreshing.';
}

export default function CounterPage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [workerName, setWorkerName] = useState('Counter worker');
  const [businessDate, setBusinessDate] = useState(todayInBusinessTime);
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({});
  const paymentKeys = useRef<Record<string, string>>({});

  const loadQueue = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ businessDate, status, search, limit: '100' });
      const data = await apiRequest<QueueResponse>(`/api/counter/orders?${params}`);
      setOrders(data.orders);
      setLastRefreshedAt(data.lastRefreshedAt);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        window.location.assign('/counter/login?returnTo=%2Fcounter');
        return;
      }
      setError('The live queue is temporarily unavailable. Existing cards may be stale; use Retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessDate, search, status]);

  useEffect(() => {
    apiRequest<{ worker: { name: string } }>('/api/counter/me').then(data => setWorkerName(data.worker.name)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(true), 5_000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  function reconcile(id: string, patch: Partial<QueueOrder>) {
    setOrders(current => current.map(order => order.id === id ? { ...order, ...patch } : order));
  }

  async function updateStatus(order: QueueOrder, nextStatus: CounterStatus) {
    if (busyId) return;
    let reason: string | undefined;
    if (nextStatus === 'cancelled') {
      reason = window.prompt('Cancellation reason (required):')?.trim() || undefined;
      if (!reason || reason.length < 3 || reason.length > 300) {
        window.alert('Enter a cancellation reason between 3 and 300 characters.');
        return;
      }
    }
    setBusyId(order.id);
    setOrderErrors(current => ({ ...current, [order.id]: '' }));
    try {
      const data = await apiRequest<{ order: Partial<QueueOrder> }>(`/api/counter/orders/${order.id}`, {
        method: 'PATCH', body: { orderStatus: nextStatus, expectedVersion: order.stateVersion, reason },
      });
      reconcile(order.id, data.order);
      await loadQueue(true);
    } catch (requestError) {
      setOrderErrors(current => ({ ...current, [order.id]: friendlyError(requestError) }));
      if (requestError instanceof ApiClientError && requestError.code === 'STALE_ORDER_VERSION') await loadQueue(true);
    } finally {
      setBusyId(null);
    }
  }

  async function recordPayment(order: QueueOrder) {
    if (busyId) return;
    const draft = paymentDrafts[order.id] ?? { method: 'cash', transactionReference: '', merchantReceiptVerified: false };
    const outstanding = Math.max(0, order.totalPaise - order.collectedPaise);
    if (!outstanding) return;
    const key = paymentKeys.current[order.id] ?? crypto.randomUUID();
    paymentKeys.current[order.id] = key;
    setBusyId(order.id);
    setOrderErrors(current => ({ ...current, [order.id]: '' }));
    try {
      const data = await apiRequest<{ order: Partial<QueueOrder> }>('/api/counter/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          orderId: order.id,
          method: draft.method,
          amountPaise: outstanding,
          transactionReference: draft.transactionReference || undefined,
          merchantReceiptVerified: draft.merchantReceiptVerified,
        },
      });
      delete paymentKeys.current[order.id];
      reconcile(order.id, data.order);
      await loadQueue(true);
    } catch (requestError) {
      setOrderErrors(current => ({ ...current, [order.id]: friendlyError(requestError) }));
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    try { await apiRequest('/counter/api/logout', { method: 'POST' }); } finally {
      clearApiClientSession();
      window.location.assign('/counter/login');
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#090909] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090909]/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">Shatvika Corner</p><h1 className="text-2xl font-black">Live token queue</h1></div>
          <div className="flex items-center gap-3 text-sm"><span className="text-gray-300">{workerName}</span><button onClick={logout} className="rounded-lg border border-white/15 px-3 py-2 font-semibold hover:border-orange-400">Sign out</button></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-4">
          <div><label htmlFor="queue-date" className="mb-1 block text-xs font-bold text-gray-400">Business date</label><input id="queue-date" type="date" value={businessDate} onChange={event => setBusinessDate(event.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2" /></div>
          <div><label htmlFor="queue-status" className="mb-1 block text-xs font-bold text-gray-400">Status</label><select id="queue-status" value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2"><option value="active">Active queue</option><option value="all">All</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="queue-search" className="mb-1 block text-xs font-bold text-gray-400">Token or order ID</label><input id="queue-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="042" className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2" /></div>
          <div className="flex items-end"><button onClick={() => void loadQueue(true)} disabled={refreshing} className="w-full rounded-lg bg-orange-600 px-3 py-2 font-bold disabled:opacity-60">{refreshing ? 'Refreshing…' : 'Refresh now'}</button></div>
        </div>

        <div aria-live="polite" className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-gray-400">
          <span>{orders.length} order{orders.length === 1 ? '' : 's'} shown</span>
          <span>{lastRefreshedAt ? `Last refreshed ${new Date(lastRefreshedAt).toLocaleTimeString('en-IN')}` : 'Not refreshed yet'} · reconnects every 5 seconds</span>
        </div>
        {error && <div role="alert" className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100"><span>{error}</span><button onClick={() => void loadQueue()} className="rounded-lg border border-red-300/40 px-3 py-1 font-bold">Retry</button></div>}
        {loading ? <div className="mt-10 text-center text-gray-400" role="status">Loading counter queue…</div> : orders.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed border-white/15 p-10 text-center"><p className="text-xl font-bold">No matching tokens</p><p className="mt-2 text-sm text-gray-400">New confirmed orders will appear automatically.</p></div> : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {orders.map(order => {
              const draft = paymentDrafts[order.id] ?? { method: 'cash', transactionReference: '', merchantReceiptVerified: false };
              const outstanding = Math.max(0, order.totalPaise - order.collectedPaise);
              const action = nextAction[order.orderStatus];
              const canCancel = ['placed', 'accepted', 'preparing', 'ready'].includes(order.orderStatus);
              return <article key={order.id} className={`rounded-2xl border p-5 ${order.orderStatus === 'ready' ? 'border-emerald-400/50 bg-emerald-400/[0.06]' : 'border-white/10 bg-[#151515]'}`}>
                <div className="flex items-start justify-between gap-4"><div><p className="text-3xl font-black text-orange-400">{order.tokenNumber}</p><p className="mt-1 text-xs text-gray-500">{new Date(order.createdAt).toLocaleString('en-IN')} · {order.id}</p></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-extrabold uppercase">{statusLabel[order.orderStatus]}</span></div>
                <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between gap-3 py-2 text-sm"><span><strong>{item.quantity}×</strong> {item.name}{item.variantName && item.variantName !== 'Regular' ? ` · ${item.variantName}` : ''}</span><span>{money(item.totalPricePaise)}</span></li>)}</ul>
                {order.specialInstructions && <p className="mt-3 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-100"><strong>Note:</strong> {order.specialInstructions}</p>}
                <div className="mt-4 flex items-center justify-between"><div><p className="text-xs text-gray-400">Total</p><p className="text-xl font-black">{money(order.totalPaise)}</p></div><div className="text-right"><p className="text-xs text-gray-400">Payment</p><p className={`font-bold ${order.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-amber-300'}`}>{order.paymentStatus.replaceAll('_', ' ')}{order.paymentStatus === 'paid' ? ` · ${order.paymentMethod.toUpperCase()}` : ` · ${money(outstanding)} due`}</p></div></div>

                {order.paymentStatus !== 'paid' && order.orderStatus !== 'cancelled' && <fieldset className="mt-4 rounded-xl border border-white/10 p-3"><legend className="px-1 text-xs font-bold text-gray-400">Verify counter payment</legend><div className="grid gap-2 sm:grid-cols-2"><select aria-label={`Payment method for ${order.tokenNumber}`} value={draft.method} onChange={event => setPaymentDrafts(current => ({ ...current, [order.id]: { ...draft, method: event.target.value as 'cash' | 'upi', merchantReceiptVerified: false } }))} className="rounded-lg border border-white/15 bg-[#202020] px-3 py-2"><option value="cash">Cash received</option><option value="upi">UPI verified</option></select>{draft.method === 'upi' && <input aria-label={`UPI reference for ${order.tokenNumber}`} placeholder="Merchant transaction reference" value={draft.transactionReference} onChange={event => setPaymentDrafts(current => ({ ...current, [order.id]: { ...draft, transactionReference: event.target.value } }))} className="rounded-lg border border-white/15 bg-[#202020] px-3 py-2" />}</div>{draft.method === 'upi' && <label className="mt-3 flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" className="mt-0.5" checked={draft.merchantReceiptVerified} onChange={event => setPaymentDrafts(current => ({ ...current, [order.id]: { ...draft, merchantReceiptVerified: event.target.checked } }))} /><span>I verified this payment in the merchant payment source. A customer screenshot alone is not sufficient.</span></label>}<button onClick={() => void recordPayment(order)} disabled={busyId !== null || (draft.method === 'upi' && (!draft.merchantReceiptVerified || draft.transactionReference.trim().length < 3))} className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50">Record {money(outstanding)} received</button></fieldset>}

                {orderErrors[order.id] && <p role="alert" className="mt-3 text-sm text-red-300">{orderErrors[order.id]}</p>}
                <div className="mt-4 flex flex-wrap gap-2">{action && <button onClick={() => void updateStatus(order, action.status)} disabled={busyId !== null || (action.status === 'served' && order.paymentStatus !== 'paid')} className="min-h-11 flex-1 rounded-lg bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-4 py-2 font-extrabold disabled:cursor-not-allowed disabled:opacity-50">{busyId === order.id ? 'Saving…' : action.label}</button>}{canCancel && <button onClick={() => void updateStatus(order, 'cancelled')} disabled={busyId !== null} className="min-h-11 rounded-lg border border-red-400/40 px-4 py-2 font-bold text-red-200 disabled:opacity-50">Cancel</button>}</div>
                {action?.status === 'served' && order.paymentStatus !== 'paid' && <p className="mt-2 text-xs text-amber-300">Serving is blocked until payment is verified. Only an admin can authorize an exception.</p>}
              </article>;
            })}
          </div>
        )}
      </section>
    </main>
  );
}
