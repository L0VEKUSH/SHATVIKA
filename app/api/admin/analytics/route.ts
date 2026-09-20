import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { AnalyticsFilterError, parseAnalyticsSearchParams, resolveAnalyticsFilters } from '@/lib/analytics/filters';
import { AnalyticsDataLimitError, getAnalyticsSnapshot, redactSnapshotForDashboard } from '@/lib/analytics/service';
import { distributedRateLimit } from '@/lib/rateLimit';
import { logServerError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: NextRequest) {
  try {
    await connectToMongo();
  } catch (error) {
    logServerError({ route: 'GET /api/admin/analytics connect', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json(
      { ok: false, error: 'DATABASE_UNAVAILABLE' },
      { status: 503, headers: PRIVATE_HEADERS },
    );
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
    limited = await distributedRateLimit(`analytics:${admin.accountId}`, 30, 60);
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
    const query = parseAnalyticsSearchParams(request.nextUrl.searchParams);
    const filters = resolveAnalyticsFilters(query);
    const snapshot = await getAnalyticsSnapshot(filters);
    return NextResponse.json(redactSnapshotForDashboard(snapshot), { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof AnalyticsFilterError) {
      return NextResponse.json(
        { ok: false, error: error.code, details: error.details },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }
    if (error instanceof AnalyticsDataLimitError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: 'Narrow the date range or filters and try again.' },
        { status: 422, headers: PRIVATE_HEADERS },
      );
    }
    logServerError({ route: 'GET /api/admin/analytics', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json(
      { ok: false, error: 'ANALYTICS_FAILED' },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}
