'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileArchive, FileSpreadsheet, FileText, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiClientError } from '@/lib/apiClient';
import { REPORT_FORMATS, REPORT_TYPES, type AnalyticsFilterWire, type ReportFormat, type ReportType } from '@/lib/analytics/contracts';

type ReportRecord = {
  id: string;
  reportType: ReportType;
  format: ReportFormat;
  rowCount: number;
  status: 'ready' | 'generating' | 'completed' | 'failed';
  asOfUtc: string;
  expiresAt: string;
  generatedAt?: string | null;
  downloadedAt?: string | null;
  downloadUrl?: string;
};

type CreateResponse = { ok: true; report: ReportRecord & { downloadUrl: string } };
type ListResponse = { ok: true; reports: ReportRecord[] };

const REPORT_DETAILS: Record<ReportType, { label: string; description: string }> = {
  'business-summary': { label: 'Business summary', description: 'Fulfilment, sales, collections, costs, expenses, profit availability, and comparison metrics.' },
  'detailed-orders-tokens': { label: 'Detailed orders and tokens', description: 'Order IDs, readable tokens, fulfilment, totals, payment state, and serving worker.' },
  'sold-items': { label: 'Detailed sold items', description: 'Every fulfilled line with selling price, discount, refund allocation, immutable cost, and calculable profit.' },
  'sales-costs-profit': { label: 'Sales, costs and profit', description: 'Reconciled sales components, cost coverage, operating expenses, and profit availability.' },
  expenses: { label: 'Operating expenses', description: 'Audited active and voided operating-expense records for the selected period.' },
  'inventory-wastage': { label: 'Inventory and wastage', description: 'Current stock plus recorded reservation, release, adjustment, and wastage events.' },
  'counter-operations': { label: 'Counter operations', description: 'Tokens, queue states, recorded preparation and collection waits, cancellations, and serving workers.' },
  'sales-orders': { label: 'Sales and orders', description: 'Order-level sales, discounts, tax, delivery, collections, and refunds.' },
  'products-categories': { label: 'Products and categories', description: 'Units, merchandise contribution, historical cost coverage, and category totals.' },
  customers: { label: 'Customers', description: 'Minimized customer summary, new/returning segments, frequency, and historical value.' },
  inventory: { label: 'Inventory', description: 'Current quantities, reorder points, stockouts, and manually disabled products.' },
  coupons: { label: 'Coupons', description: 'Redemptions, discounts, associated order value, limits, and repeat purchasers.' },
  'payments-refunds': { label: 'Payments and refunds', description: 'Recorded payment/refund events and reconciliation fields.' },
  operations: { label: 'Operations', description: 'Queue states, recorded stage durations, overdue orders, and cancellations.' },
  reviews: { label: 'Review summary', description: 'Ratings, moderation status, low-rated products, and verified purchases.' },
  consolidated: { label: 'Consolidated business report', description: 'Executive summary plus all authorized report sections in one download.' },
};

const FORMAT_DETAILS: Record<ReportFormat, { label: string; note: string; icon: typeof FileText }> = {
  csv: { label: 'CSV', note: 'UTF-8 tabular export', icon: FileText },
  xlsx: { label: 'XLSX', note: 'Typed workbook with sheets', icon: FileSpreadsheet },
  pdf: { label: 'PDF', note: 'Paginated business report', icon: FileArchive },
};

function reportError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your admin session expired. Sign in again before exporting.';
    if (error.status === 429) return `Export limit reached. Try again${error.retryAfter ? ` in ${error.retryAfter} seconds` : ' shortly'}.`;
    if (error.code === 'REPORT_TOO_LARGE' || error.code === 'REPORT_FILE_TOO_LARGE') return 'This export is larger than the safe row or file limit. Narrow the date range or filters.';
    if (error.code === 'REPORT_TIMEOUT') return 'This export took too long to prepare. Narrow the date range or filters.';
    if (error.code === 'REPORT_SNAPSHOT_EXPIRED') return 'Refresh the dashboard, then generate the report so both use the same data cutoff.';
    if (error.code === 'INVALID_FILTERS' || error.code === 'INVALID_REPORT_REQUEST') return 'The active report filters are no longer valid. Reapply the dashboard filters and try again.';
    if (error.code === 'DETAILED_EXPORT_PERMISSION_REQUIRED') return 'Detailed customer information requires an explicit reports:pii permission.';
    if (error.code === 'DATABASE_UNAVAILABLE') return 'Reports are unavailable while the database is offline.';
    if (error.code === 'RATE_LIMIT_UNAVAILABLE') return 'Report throttling is temporarily unavailable. Please try again shortly.';
    return error.message;
  }
  return 'The report could not be prepared.';
}

function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

export default function ReportsPanel({
  filters,
  asOfUtc,
  periodLabel,
  timeZone,
}: {
  filters: AnalyticsFilterWire;
  asOfUtc: string;
  periodLabel: string;
  timeZone: string;
}) {
  const [reportType, setReportType] = useState<ReportType>('consolidated');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [clockMs, setClockMs] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const payload = await apiRequest<ListResponse>('/api/admin/reports');
      setReports(payload.reports);
    } catch (error) {
      setHistoryError(reportError(error));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    setClockMs(Date.now());
    const timer = window.setInterval(() => setClockMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function createReport() {
    setCreating(true);
    setMessage(null);
    try {
      const payload = await apiRequest<CreateResponse>('/api/admin/reports', {
        method: 'POST',
        body: { reportType, format, filters, asOfUtc, includeCustomerDetails: false },
      });
      setReports(current => [payload.report, ...current.filter(item => item.id !== payload.report.id)].slice(0, 20));
      setMessage({ kind: 'success', text: `${REPORT_DETAILS[reportType].label} prepared with ${payload.report.rowCount.toLocaleString('en-IN')} rows. Your download is starting.` });
      const link = document.createElement('a');
      link.href = payload.report.downloadUrl;
      link.download = '';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setMessage({ kind: 'error', text: reportError(error) });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section id="reports" className="scroll-mt-24 space-y-5" aria-labelledby="reports-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF8C00]">Reconciliation exports</p>
          <h2 id="reports-heading" className="mt-1 text-xl font-black text-white">Downloadable business reports</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            Exports reuse the active period, filters, definitions, timezone, rounding, and the dashboard&apos;s exact data cutoff. They include all authorized filtered rows—not just the visible table page. Refresh the dashboard first if its snapshot is more than 30 minutes old.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          Private, expiring downloads
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
        <div className="glass rounded-2xl border border-white/10 p-4 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="report-type" className="text-xs font-semibold text-gray-300">Report scope</label>
              <select id="report-type" value={reportType} onChange={event => setReportType(event.target.value as ReportType)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111] px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF8C00]">
                {REPORT_TYPES.map(type => <option key={type} value={type}>{REPORT_DETAILS[type].label}</option>)}
              </select>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-gray-500">{REPORT_DETAILS[reportType].description}</p>
            </div>

            <fieldset>
              <legend className="text-xs font-semibold text-gray-300">File format</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {REPORT_FORMATS.map(value => {
                  const detail = FORMAT_DETAILS[value];
                  const Icon = detail.icon;
                  return (
                    <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value} className={`rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#FF8C00] ${format === value ? 'border-[#FF8C00]/60 bg-[#FF8C00]/10 text-white' : 'border-white/10 bg-white/[0.025] text-gray-400 hover:border-white/20'}`}>
                      <Icon className="mb-2 h-4 w-4" aria-hidden="true" />
                      <span className="block text-xs font-bold">{detail.label}</span>
                      <span className="mt-1 hidden text-[10px] text-gray-500 sm:block">{detail.note}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <dl className="mt-5 grid gap-3 rounded-xl border border-white/5 bg-black/20 p-4 text-xs sm:grid-cols-3">
            <div><dt className="text-gray-600">Period</dt><dd className="mt-1 text-gray-300">{periodLabel}</dd></div>
            <div><dt className="text-gray-600">Business timezone</dt><dd className="mt-1 text-gray-300">{timeZone}</dd></div>
            <div><dt className="text-gray-600">Dashboard currently as of</dt><dd className="mt-1 text-gray-300">{formatDateTime(asOfUtc, timeZone)}</dd></div>
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-400/15 bg-blue-400/5 p-3 text-xs leading-relaxed text-blue-200/80">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Customer exports are minimized by default. Email, phone, addresses, credentials, tokens, and internal authentication fields are excluded; detailed PII export remains disabled until a deliberate permission is configured.
          </div>

          {message && (
            <div role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border px-4 py-3 text-xs ${message.kind === 'error' ? 'border-red-400/20 bg-red-400/5 text-red-200' : 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200'}`}>
              {message.text}
            </div>
          )}

          <button type="button" onClick={() => void createReport()} disabled={creating} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#FF4500]/15 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#FFD700] focus:ring-offset-2 focus:ring-offset-[#0a0a0a] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {creating ? 'Preparing report…' : `Generate and download ${format.toUpperCase()}`}
          </button>
        </div>

        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Recent exports</h3>
              <p className="mt-1 text-[11px] text-gray-500">Your 20 most recent exports</p>
            </div>
            <button type="button" onClick={() => void loadHistory()} disabled={loadingHistory} className="rounded-lg border border-white/10 p-2 text-gray-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50" aria-label="Refresh export history"><RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} /></button>
          </div>
          <div className="max-h-[25rem] divide-y divide-white/5 overflow-y-auto" aria-busy={loadingHistory}>
            {historyError && (
              <div role="alert" className="border-b border-red-400/10 bg-red-400/5 p-4 text-xs text-red-200">
                {historyError} <button type="button" onClick={() => void loadHistory()} className="ml-1 font-semibold text-[#FFB347] hover:underline">Try again</button>
              </div>
            )}
            {loadingHistory && reports.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-8 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading exports…</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">No reports have been prepared in this session.</div>
            ) : reports.map(report => {
              const expiresAt = new Date(report.expiresAt).getTime();
              const expired = !Number.isFinite(expiresAt) || (clockMs > 0 && expiresAt <= clockMs);
              const canDownload = !expired && report.status === 'completed';
              return (
                <div key={report.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-gray-200">{REPORT_DETAILS[report.reportType]?.label ?? report.reportType}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-600">{report.format} · {report.rowCount.toLocaleString('en-IN')} rows</p>
                      <p className="mt-1 text-[10px] text-gray-600">Snapshot {formatDateTime(report.asOfUtc, timeZone)}</p>
                      <p className="mt-1 text-[10px] text-gray-600">{expired ? 'Expired' : `Expires ${formatDateTime(report.expiresAt, timeZone)}`}</p>
                    </div>
                    {canDownload ? (
                      <a href={report.downloadUrl ?? `/api/admin/reports/${report.id}/download`} download className="shrink-0 rounded-lg border border-white/10 p-2 text-gray-400 transition hover:border-[#FF8C00]/40 hover:text-[#FF8C00] focus:outline-none focus:ring-2 focus:ring-[#FF8C00]" aria-label={`Download ${REPORT_DETAILS[report.reportType]?.label ?? report.reportType} as ${report.format.toUpperCase()}`}><Download className="h-4 w-4" aria-hidden="true" /></a>
                    ) : <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] capitalize text-gray-600">{expired ? 'Expired' : report.status === 'generating' || report.status === 'ready' ? 'Preparing' : report.status}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
