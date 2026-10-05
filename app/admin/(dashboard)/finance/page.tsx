'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError, apiRequest } from '@/lib/apiClient';

type MenuItem = { _id?: string; id?: string; name: string; quantity: number; variants?: { id: string; name: string }[] };
type Expense = { id: string; incurredAt: string; category: string; amountPaise: number; note: string; status: string; stateVersion: number; voidReason?: string };
type CostRecord = { id: string; menuItemId: string; variantId: string; ingredientPaise: number; productPaise: number; packagingPaise: number; totalCostPaise: number; effectiveAt: string; note: string };
type InventoryEvent = { id: string; occurredAt: string; productName: string; type: string; quantity: number; quantityDelta: number; reason: string; orderId?: string | null };
type ExpensePeriod = { id: string; month: string; complete: boolean; note?: string | null };

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

function toPaise(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : -1;
}

function message(error: unknown) {
  if (error instanceof ApiClientError && error.code === 'FORBIDDEN') return 'Your admin account does not have the required finance or inventory permission.';
  return error instanceof Error ? error.message : 'The change could not be saved.';
}

export default function FinancePage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expenseForm, setExpenseForm] = useState({ date: new Date().toISOString().slice(0, 10), category: 'rent', amount: '', note: '' });
  const [costForm, setCostForm] = useState({ menuItemId: '', variantId: 'base', ingredient: '', product: '', packaging: '', note: '' });
  const [stockForm, setStockForm] = useState({ menuItemId: '', type: 'wastage', quantity: '', reason: '' });
  const [periodForm, setPeriodForm] = useState({ month: new Date().toISOString().slice(0, 7), complete: false, note: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 90 * 86_400_000).toISOString();
      const to = new Date(now.getTime() + 1_000).toISOString();
      const [menuRows, expenseData, costData, eventData, periodData] = await Promise.all([
        apiRequest<MenuItem[]>('/api/menu?scope=admin'),
        apiRequest<{ expenses: Expense[] }>(`/api/admin/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        apiRequest<{ records: CostRecord[] }>('/api/admin/costs?limit=100'),
        apiRequest<{ events: InventoryEvent[] }>(`/api/admin/inventory-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        apiRequest<{ periods: ExpensePeriod[] }>('/api/admin/expense-periods'),
      ]);
      setMenu(menuRows); setExpenses(expenseData.expenses); setCosts(costData.records); setEvents(eventData.events); setPeriods(periodData.periods);
      setCostForm(current => ({ ...current, menuItemId: current.menuItemId || String(menuRows[0]?.id ?? menuRows[0]?._id ?? '') }));
      setStockForm(current => ({ ...current, menuItemId: current.menuItemId || String(menuRows[0]?.id ?? menuRows[0]?._id ?? '') }));
    } catch (caught) { setError(message(caught)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selectedCostItem = useMemo(() => menu.find(item => String(item.id ?? item._id) === costForm.menuItemId), [costForm.menuItemId, menu]);

  async function saveExpense(event: FormEvent) {
    event.preventDefault(); const amountPaise = toPaise(expenseForm.amount); if (amountPaise <= 0) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/api/admin/expenses', { method: 'POST', body: { incurredAt: new Date(`${expenseForm.date}T12:00:00+05:30`).toISOString(), category: expenseForm.category, amountPaise, note: expenseForm.note } });
      setExpenseForm(current => ({ ...current, amount: '', note: '' })); setNotice('Operating expense recorded.'); await load();
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }

  async function voidExpense(expense: Expense) {
    const reason = window.prompt('Reason for voiding this expense record:')?.trim();
    if (!reason || reason.length < 3 || reason.length > 300) {
      window.alert('Enter a void reason between 3 and 300 characters.');
      return;
    }
    setBusy(true); setError('');
    try { await apiRequest(`/api/admin/expenses/${expense.id}`, { method: 'PATCH', body: { reason, expectedVersion: expense.stateVersion } }); setNotice('Expense voided with an audit reason.'); await load(); }
    catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }

  async function saveCost(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/api/admin/costs', { method: 'POST', body: {
        menuItemId: costForm.menuItemId, variantId: costForm.variantId,
        ingredientPaise: toPaise(costForm.ingredient || '0'), productPaise: toPaise(costForm.product || '0'), packagingPaise: toPaise(costForm.packaging || '0'), note: costForm.note,
      } });
      setCostForm(current => ({ ...current, ingredient: '', product: '', packaging: '', note: '' }));
      setNotice('Future unit cost updated and audit record created. Historical orders were not changed.'); await load();
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }

  async function saveStock(event: FormEvent) {
    event.preventDefault(); const quantity = Number(stockForm.quantity); if (!Number.isSafeInteger(quantity) || quantity === 0) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/api/admin/inventory-events', { method: 'POST', body: stockForm.type === 'wastage'
        ? { type: 'wastage', menuItemId: stockForm.menuItemId, variantId: 'base', quantity: Math.abs(quantity), reason: stockForm.reason }
        : { type: 'adjustment', menuItemId: stockForm.menuItemId, variantId: 'base', quantityDelta: quantity, reason: stockForm.reason } });
      setStockForm(current => ({ ...current, quantity: '', reason: '' })); setNotice('Inventory change and audit event recorded.'); await load();
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }

  async function savePeriod(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await apiRequest('/api/admin/expense-periods', { method: 'POST', body: periodForm }); setNotice(periodForm.complete ? 'Expense month marked complete.' : 'Expense month reopened; finalized profit will be suppressed.'); await load(); }
    catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  }

  const field = 'mt-1 w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500';
  const card = 'rounded-2xl border border-white/10 bg-white/[0.025] p-5';
  return <div className="mx-auto max-w-7xl space-y-6">
    <header><h1 className="text-3xl font-black text-white">Costs, expenses & inventory</h1><p className="mt-2 text-sm text-gray-500">Auditable inputs for future cost snapshots, operating expenses, stock adjustments, and wastage. Ingredient/product/packaging costs are not counted again as operating expenses.</p></header>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}
    {loading ? <p role="status" className="py-12 text-center text-gray-500">Loading finance records…</p> : <>
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveCost} className={card}><h2 className="text-lg font-bold">Record future unit cost</h2><p className="mt-1 text-xs text-amber-200/70">Affects only orders confirmed after this change. Existing order-time snapshots remain immutable.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-400">Item<select className={field} value={costForm.menuItemId} onChange={e => setCostForm({ ...costForm, menuItemId: e.target.value, variantId: 'base' })}>{menu.map(item => <option key={String(item.id ?? item._id)} value={String(item.id ?? item._id)}>{item.name}</option>)}</select></label>
          <label className="text-xs text-gray-400">Variant<select className={field} value={costForm.variantId} onChange={e => setCostForm({ ...costForm, variantId: e.target.value })}>{selectedCostItem?.variants?.length ? selectedCostItem.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>) : <option value="base">Regular</option>}</select></label>
          <label className="text-xs text-gray-400">Ingredient cost ₹<input className={field} type="number" min="0" step="0.01" value={costForm.ingredient} onChange={e => setCostForm({ ...costForm, ingredient: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Purchased product cost ₹<input className={field} type="number" min="0" step="0.01" value={costForm.product} onChange={e => setCostForm({ ...costForm, product: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Packaging cost ₹<input className={field} type="number" min="0" step="0.01" value={costForm.packaging} onChange={e => setCostForm({ ...costForm, packaging: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Audit note<input className={field} required minLength={3} maxLength={500} value={costForm.note} onChange={e => setCostForm({ ...costForm, note: e.target.value })} /></label>
        </div><button disabled={busy} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold disabled:opacity-50">Save cost input</button></form>

        <form onSubmit={saveExpense} className={card}><h2 className="text-lg font-bold">Record operating expense</h2><p className="mt-1 text-xs text-gray-500">Only rent, electricity, wages, and other overhead belong here. Product and packaging costs belong in unit costs.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-400">Date<input className={field} type="date" required value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Category<select className={field} value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>{['rent','electricity','wages','other'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs text-gray-400">Amount ₹<input className={field} type="number" min="0.01" step="0.01" required value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Note<input className={field} required minLength={3} maxLength={500} value={expenseForm.note} onChange={e => setExpenseForm({ ...expenseForm, note: e.target.value })} /></label>
        </div><button disabled={busy} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold disabled:opacity-50">Record expense</button></form>

        <form onSubmit={saveStock} className={card}><h2 className="text-lg font-bold">Stock adjustment or wastage</h2><p className="mt-1 text-xs text-gray-500">Prepared-order cancellation wastage is recorded automatically. Use this form only for separately observed stock changes.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-400">Item<select className={field} value={stockForm.menuItemId} onChange={e => setStockForm({ ...stockForm, menuItemId: e.target.value })}>{menu.map(item => <option key={String(item.id ?? item._id)} value={String(item.id ?? item._id)}>{item.name} ({item.quantity})</option>)}</select></label>
          <label className="text-xs text-gray-400">Type<select className={field} value={stockForm.type} onChange={e => setStockForm({ ...stockForm, type: e.target.value })}><option value="wastage">Wastage</option><option value="adjustment">Adjustment (+ or −)</option></select></label>
          <label className="text-xs text-gray-400">{stockForm.type === 'wastage' ? 'Quantity wasted' : 'Quantity change'}<input className={field} type="number" required step="1" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} /></label>
          <label className="text-xs text-gray-400">Reason<input className={field} required minLength={3} maxLength={300} value={stockForm.reason} onChange={e => setStockForm({ ...stockForm, reason: e.target.value })} /></label>
        </div><button disabled={busy} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold disabled:opacity-50">Record stock event</button></form>

        <form onSubmit={savePeriod} className={card}><h2 className="text-lg font-bold">Expense completeness</h2><p className="mt-1 text-xs text-gray-500">Finalized net profit is shown only when order-time cost coverage is complete and every included month is confirmed complete.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-gray-400">Month<input className={field} type="month" value={periodForm.month} onChange={e => setPeriodForm({ ...periodForm, month: e.target.value })} /></label><label className="flex items-center gap-2 self-end rounded-xl border border-white/10 p-3 text-sm"><input type="checkbox" checked={periodForm.complete} onChange={e => setPeriodForm({ ...periodForm, complete: e.target.checked })} /> All operating expenses for this month are recorded</label><label className="text-xs text-gray-400 sm:col-span-2">Note<input className={field} maxLength={500} value={periodForm.note} onChange={e => setPeriodForm({ ...periodForm, note: e.target.value })} /></label></div><button disabled={busy} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold disabled:opacity-50">Save month status</button><div className="mt-4 flex flex-wrap gap-2">{periods.map(period => <span key={period.id} className={`rounded-full px-3 py-1 text-xs ${period.complete ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{period.month}: {period.complete ? 'complete' : 'open'}</span>)}</div></form>
      </div>

      <section className={card}><h2 className="text-lg font-bold">Recent operating expenses</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-gray-500"><tr><th className="p-2">Date</th><th className="p-2">Category</th><th className="p-2">Note</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{expenses.map(expense => <tr key={expense.id} className="border-t border-white/5"><td className="p-2">{new Date(expense.incurredAt).toLocaleDateString('en-IN')}</td><td className="p-2 capitalize">{expense.category}</td><td className="max-w-md p-2">{expense.note}</td><td className="p-2 text-amber-300">{money(expense.amountPaise)}</td><td className="p-2 capitalize">{expense.status}{expense.voidReason ? ` · ${expense.voidReason}` : ''}</td><td className="p-2">{expense.status === 'active' && <button onClick={() => void voidExpense(expense)} disabled={busy} className="text-red-300 underline">Void</button>}</td></tr>)}</tbody></table>{!expenses.length && <p className="p-6 text-center text-gray-500">No expenses recorded in the last 90 days.</p>}</div></section>
      <div className="grid gap-5 xl:grid-cols-2"><section className={card}><h2 className="text-lg font-bold">Recent cost audit</h2><div className="mt-3 space-y-2">{costs.slice(0,20).map(record => <div key={record.id} className="rounded-xl bg-black/20 p-3 text-xs"><div className="flex justify-between"><span className="font-mono text-gray-400">{record.menuItemId} · {record.variantId}</span><strong className="text-amber-300">{money(record.totalCostPaise)}</strong></div><p className="mt-1 text-gray-500">{record.note} · {new Date(record.effectiveAt).toLocaleString('en-IN')}</p></div>)}</div></section><section className={card}><h2 className="text-lg font-bold">Recent inventory audit</h2><div className="mt-3 space-y-2">{events.slice(0,20).map(event => <div key={event.id} className="rounded-xl bg-black/20 p-3 text-xs"><div className="flex justify-between"><span className="font-semibold">{event.productName} · {event.type.replaceAll('_',' ')}</span><strong className={event.quantityDelta < 0 ? 'text-red-300' : 'text-emerald-300'}>{event.quantityDelta > 0 ? '+' : ''}{event.quantityDelta}</strong></div><p className="mt-1 text-gray-500">{event.reason} · {new Date(event.occurredAt).toLocaleString('en-IN')}{event.orderId ? ` · order ${event.orderId}` : ''}</p></div>)}</div></section></div>
    </>}
  </div>;
}
