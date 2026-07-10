'use client';

import { useMemo } from 'react';

type Granularity = 'day' | 'week' | 'month' | 'year';

export interface ReportRow {
  label: string;
  selling: number;
  profit: number;
  deliveredOrders: number;
}

function formatMoney(n: number) {
  return `₹${n.toFixed(2)}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  // Mon-start week
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // Mon=0
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfYear(d: Date) {
  const x = new Date(d);
  x.setMonth(0, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function safeDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function buildReportRows({
  orders,
  granularity,
  profitMode,
}: {
  orders: Array<{ status: string; total: number; createdAt?: string } & Record<string, any>>;
  granularity: Granularity;
  profitMode: 'estimated-memo';
}): ReportRow[] {
  // profitMode is placeholder since you said profit should be different but to leave it.
  // We will estimate profit as 25% of selling (i.e., cost 75%) to show variation.
  const profitFactor = 0.25;

  const delivered = orders.filter(o => o.status === 'Delivered');

  const now = new Date();
  let buckets: Array<{ key: number; start: Date; end: Date; label: string }> = [];

  if (granularity === 'day') {
    const todayStart = startOfDay(now);
    const start = addDays(todayStart, -6); // last 7 days
    for (let i = 0; i < 7; i++) {
      const s = addDays(start, i);
      const e = addDays(s, 1);
      buckets.push({ key: i, start: s, end: e, label: s.toLocaleDateString(undefined, { weekday: 'short' }) });
    }
  }

  if (granularity === 'week') {
    // last 4 weeks
    const startThis = startOfWeek(now);
    for (let i = 3; i >= 0; i--) {
      const s = addDays(startThis, -7 * i);
      const e = addDays(s, 7);
      buckets.push({
        key: 10 + i,
        start: s,
        end: e,
        label: `Wk ${i + 1}`,
      });
    }
  }

  if (granularity === 'month') {
    // last 6 months
    const startThis = startOfMonth(now);
    for (let i = 5; i >= 0; i--) {
      const s = addMonths(startThis, -i);
      const e = addMonths(s, 1);
      buckets.push({ key: 20 + i, start: s, end: e, label: s.toLocaleDateString(undefined, { month: 'short' }) });
    }
  }

  if (granularity === 'year') {
    // last 5 years
    const startThis = startOfYear(now);
    for (let i = 4; i >= 0; i--) {
      const s = new Date(startThis);
      s.setFullYear(s.getFullYear() - i);
      const e = new Date(s);
      e.setFullYear(e.getFullYear() + 1);
      buckets.push({ key: 30 + i, start: s, end: e, label: String(s.getFullYear()) });
    }
  }

  const rows: ReportRow[] = buckets.map(b => {
    const inBucket = delivered.filter(o => {
      const cd = safeDate(o.createdAt);
      if (!cd) return false;
      return cd >= b.start && cd < b.end;
    });

    const selling = inBucket.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const profit = selling * profitFactor; // estimated

    return {
      label: b.label,
      selling,
      profit,
      deliveredOrders: inBucket.length,
    };
  });

  // Show newest first? keep as built (oldest->newest)
  // Sum sanity: if no data, still return zeros.
  if (profitMode !== 'estimated-memo') {
    // no-op for future modes
  }

  return rows;
}

export default function ReportTable({
  orders,
  granularity,
}: {
  orders: Array<{ status: string; total: number; createdAt?: string }>;
  granularity: Granularity;
}) {
  const rows = useMemo(() => buildReportRows({ orders, granularity, profitMode: 'estimated-memo' }), [orders, granularity]);

  const headerLabel = granularity === 'day'
    ? 'Daily (last 7 days)'
    : granularity === 'week'
      ? 'Weekly (last 4 weeks)'
      : granularity === 'month'
        ? 'Monthly (last 6 months)'
        : 'Yearly (last 5 years)';

  return (
    <div className="glass rounded-2xl p-6 border border-white/8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-white font-bold text-sm">{headerLabel}</h3>
          <p className="text-gray-500 text-xs mt-0.5">Selling & estimated profit from Delivered orders</p>
        </div>
        <div className="text-[10px] text-gray-600 font-semibold">Profit shown as estimated (demo)</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/8">
              <th className="py-3 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Period</th>
              <th className="py-3 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Delivered Orders</th>
              <th className="py-3 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Selling</th>
              <th className="py-3 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Profit (est.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-white/5 last:border-b-0">
                <td className="py-3 text-sm font-bold text-white">{r.label}</td>
                <td className="py-3 text-sm text-gray-400">{r.deliveredOrders}</td>
                <td className="py-3 text-sm text-[#FF8C00] font-black">{formatMoney(r.selling)}</td>
                <td className="py-3 text-sm text-green-400 font-black">{formatMoney(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

