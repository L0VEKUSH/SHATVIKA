import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { AnalyticsFilterError, parseAnalyticsSearchParams, resolveAnalyticsFilters } from '@/lib/analytics/filters';
import { AnalyticsDataLimitError, getAnalyticsSnapshot } from '@/lib/analytics/service';
import type { AnalyticsTableName } from '@/lib/analytics/contracts';
import { distributedRateLimit } from '@/lib/rateLimit';
import { logServerError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const TABLE_NAMES = new Set<AnalyticsTableName>([
  'orders', 'products', 'categories', 'customers', 'inventory', 'coupons', 'payments', 'operations', 'reviews',
  'soldItems', 'expenses', 'inventoryEvents',
]);
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

function comparable(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value).toLocaleLowerCase('en-IN');
}

export async function GET(request: NextRequest) {
  try {
    await connectToMongo();
  } catch (error) {
    logServerError({ route: 'GET /api/admin/analytics/table connect', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  }
  let limited;
  try {
    limited = await distributedRateLimit(`analytics-table:${admin.accountId}`, 60, 60);
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
      { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(limited.retryAfter ?? 60) } },
    );
  }

  try {
    const table = request.nextUrl.searchParams.get('dataset') as AnalyticsTableName | null;
    if (!table || !TABLE_NAMES.has(table)) {
      return NextResponse.json({ ok: false, error: 'INVALID_DATASET' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '25', 10) || 25));
    const direction = request.nextUrl.searchParams.get('direction') === 'asc' ? 1 : -1;
    const query = parseAnalyticsSearchParams(request.nextUrl.searchParams);
    const snapshot = await getAnalyticsSnapshot(resolveAnalyticsFilters(query));
    let rows = [...snapshot.tables[table]] as unknown as Array<Record<string, unknown>>;
    if (table === 'customers') rows = rows.map(({ email: _email, phone: _phone, ...row }) => row);
    const requestedSort = request.nextUrl.searchParams.get('sort');
    const sortKey = requestedSort && rows.some(row => Object.prototype.hasOwnProperty.call(row, requestedSort))
      ? requestedSort
      : Object.keys(rows[0] ?? {})[0];
    if (sortKey) {
      rows.sort((left, right) => {
        const a = comparable(left[sortKey]);
        const b = comparable(right[sortKey]);
        if (a < b) return -1 * direction;
        if (a > b) return 1 * direction;
        return String(left.orderId ?? left.productId ?? left.customerId ?? '').localeCompare(String(right.orderId ?? right.productId ?? right.customerId ?? ''));
      });
    }
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return NextResponse.json({
      ok: true,
      meta: snapshot.meta,
      dataset: table,
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize),
      rows: rows.slice(start, start + pageSize),
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof AnalyticsFilterError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (error instanceof AnalyticsDataLimitError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 422, headers: PRIVATE_HEADERS });
    }
    logServerError({ route: 'GET /api/admin/analytics/table', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'ANALYTICS_TABLE_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
