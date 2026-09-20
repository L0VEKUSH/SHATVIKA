import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState, type AdminSessionState } from '@/lib/adminJwt';
import { REPORT_FORMATS, REPORT_TYPES } from '@/lib/analytics/contracts';
import {
  AnalyticsFilterError,
  filtersToWire,
  parseAnalyticsBody,
  resolveAnalyticsFilters,
} from '@/lib/analytics/filters';
import { AnalyticsDataLimitError, getAnalyticsSnapshot } from '@/lib/analytics/service';
import { distributedRateLimit } from '@/lib/rateLimit';
import { logServerError } from '@/lib/apiError';
import { buildBusinessReport } from '@/lib/reports/datasets';
import { generateReport, ReportGenerationError } from '@/lib/reports/service';
import { AuditEvent } from '@/models/AuditEvent';
import { ReportJob } from '@/models/ReportJob';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };
const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const createSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_FORMATS),
  filters: z.unknown().optional(),
  asOfUtc: z.string().datetime({ offset: true }),
  includeCustomerDetails: z.boolean().default(false),
}).strict();

type ValidAdmin = Extract<AdminSessionState, { status: 'valid' }>;

function hasPermission(admin: ValidAdmin, permission: string) {
  return admin.permissions.includes('*') || admin.permissions.includes(permission);
}

async function audit(
  admin: ValidAdmin,
  request: NextRequest,
  outcome: 'success' | 'failure',
  metadata: Record<string, unknown>,
  resourceId: string | null = null,
) {
  await AuditEvent.create({
    actorType: 'admin',
    actorId: admin.accountId,
    action: 'report.create',
    resourceType: 'report',
    resourceId,
    correlationId: request.headers.get('x-request-id'),
    outcome,
    metadata,
  }).catch(() => undefined);
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ReportGenerationError('REPORT_TIMEOUT', 'Report generation exceeded the 25 second limit. Narrow the filters.')), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  }

  let limited;
  try {
    limited = await distributedRateLimit(`report-create:${admin.accountId}`, 5, 60);
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (!limited.allowed) {
    await audit(admin, request, 'failure', { reason: 'rate_limited' });
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
      { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(limited.retryAfter ?? 60) } },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    await audit(admin, request, 'failure', { reason: 'invalid_request' });
    return NextResponse.json({ ok: false, error: 'INVALID_REPORT_REQUEST', details: parsed.error.flatten() }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const includePii = parsed.data.includeCustomerDetails;
  if (includePii && !hasPermission(admin, 'reports:pii')) {
    await audit(admin, request, 'failure', {
      reason: 'pii_permission_required',
      reportType: parsed.data.reportType,
      format: parsed.data.format,
    });
    return NextResponse.json({
      ok: false,
      error: 'DETAILED_EXPORT_PERMISSION_REQUIRED',
      message: 'The reports:pii permission is required for deliberate customer-detail exports.',
    }, { status: 403, headers: PRIVATE_HEADERS });
  }

  try {
    const query = parseAnalyticsBody(parsed.data.filters ?? {});
    const generatedAt = new Date();
    const asOf = new Date(parsed.data.asOfUtc);
    const snapshotAgeMs = generatedAt.getTime() - asOf.getTime();
    if (snapshotAgeMs < -30_000 || snapshotAgeMs > 30 * 60 * 1000) {
      throw new ReportGenerationError('REPORT_SNAPSHOT_EXPIRED', 'Refresh the dashboard before exporting so the report can use the same bounded data cutoff.');
    }
    const filters = resolveAnalyticsFilters(query, { now: asOf });
    const snapshot = await getAnalyticsSnapshot(filters);
    const report = buildBusinessReport(snapshot, parsed.data.reportType, includePii, generatedAt.toISOString());
    const generated = await withTimeout(generateReport(report, parsed.data.format), 25_000);
    if (generated.buffer.length > MAX_REPORT_BYTES) {
      throw new ReportGenerationError('REPORT_FILE_TOO_LARGE', 'The generated file exceeds the private 10 MiB storage limit. Narrow the filters.');
    }
    const checksum = crypto.createHash('sha256').update(generated.buffer).digest('hex');
    const expiresAt = new Date(generatedAt.getTime() + 15 * 60 * 1000);
    const job = await ReportJob.create({
      requesterId: admin.accountId,
      reportType: parsed.data.reportType,
      format: parsed.data.format,
      filters: filtersToWire(filters),
      includeCustomerDetails: includePii,
      asOfUtc: asOf,
      rowCount: report.rowCount,
      status: 'completed',
      generatedAt,
      byteLength: generated.buffer.length,
      checksumSha256: checksum,
      contentType: generated.contentType,
      filename: generated.filename,
      fileData: generated.buffer,
      expiresAt,
    });
    await audit(admin, request, 'success', {
      reportType: parsed.data.reportType,
      format: parsed.data.format,
      rowCount: report.rowCount,
      byteLength: generated.buffer.length,
      includeCustomerDetails: includePii,
      rangeFrom: filters.from,
      rangeToExclusive: filters.to,
    }, String(job._id));
    return NextResponse.json({
      ok: true,
      report: {
        id: String(job._id),
        reportType: job.reportType,
        format: job.format,
        rowCount: job.rowCount,
        status: job.status,
        asOfUtc: job.asOfUtc.toISOString(),
        expiresAt: job.expiresAt.toISOString(),
        downloadUrl: `/api/admin/reports/${job._id}/download`,
      },
    }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    const code = error instanceof AnalyticsFilterError || error instanceof AnalyticsDataLimitError || error instanceof ReportGenerationError
      ? error.code
      : 'REPORT_CREATION_FAILED';
    await audit(admin, request, 'failure', {
      reason: code,
      reportType: parsed.data.reportType,
      format: parsed.data.format,
      includeCustomerDetails: includePii,
    });
    if (error instanceof AnalyticsFilterError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (error instanceof AnalyticsDataLimitError || error instanceof ReportGenerationError) {
      return NextResponse.json({ ok: false, error: error.code, message: error.message }, { status: 422, headers: PRIVATE_HEADERS });
    }
    logServerError({ route: 'POST /api/admin/reports', err: error, requestId: request.headers.get('x-request-id'), extra: { code } });
    return NextResponse.json({ ok: false, error: code }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function GET() {
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  }
  try {
    const jobs = await ReportJob.find({ requesterId: admin.accountId })
      .select('+requesterId')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return NextResponse.json({
      ok: true,
      reports: jobs.map(job => ({
        id: String(job._id), reportType: job.reportType, format: job.format, rowCount: job.rowCount,
        status: job.status, asOfUtc: job.asOfUtc, expiresAt: job.expiresAt,
        generatedAt: job.generatedAt, downloadedAt: job.downloadedAt,
      })),
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    logServerError({ route: 'GET /api/admin/reports', err: error });
    return NextResponse.json({ ok: false, error: 'REPORT_LIST_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
