import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionState, type AdminSessionState } from '@/lib/adminJwt';
import { distributedRateLimit } from '@/lib/rateLimit';
import { logServerError } from '@/lib/apiError';
import { AuditEvent } from '@/models/AuditEvent';
import { ReportJob } from '@/models/ReportJob';

export const dynamic = 'force-dynamic';
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};
type ValidAdmin = Extract<AdminSessionState, { status: 'valid' }>;

async function audit(
  admin: ValidAdmin,
  request: NextRequest,
  outcome: 'success' | 'failure',
  reportId: string,
  metadata: Record<string, unknown>,
) {
  await AuditEvent.create({
    actorType: 'admin',
    actorId: admin.accountId,
    action: 'report.download',
    resourceType: 'report',
    resourceId: reportId || null,
    correlationId: request.headers.get('x-request-id'),
    outcome,
    metadata,
  }).catch(() => undefined);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    await audit(admin, request, 'failure', id, { reason: 'invalid_report_id' });
    return NextResponse.json({ ok: false, error: 'INVALID_REPORT_ID' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  let limited;
  try {
    limited = await distributedRateLimit(`report-download:${admin.accountId}`, 10, 60);
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (!limited.allowed) {
    await audit(admin, request, 'failure', id, { reason: 'rate_limited' });
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter },
      { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(limited.retryAfter ?? 60) } },
    );
  }

  try {
    const job = await ReportJob.findOne({
      _id: id,
      requesterId: admin.accountId,
      expiresAt: { $gt: new Date() },
      status: 'completed',
    }).select('+requesterId +fileData');
    if (!job) {
      const owned = await ReportJob.exists({ _id: id, requesterId: admin.accountId });
      await audit(admin, request, 'failure', id, { reason: owned ? 'expired_or_unavailable' : 'not_found' });
      return NextResponse.json(
        { ok: false, error: owned ? 'REPORT_EXPIRED_OR_UNAVAILABLE' : 'REPORT_NOT_FOUND' },
        { status: owned ? 410 : 404, headers: PRIVATE_HEADERS },
      );
    }
    const buffer = Buffer.from(job.fileData);
    if (job.byteLength !== buffer.length) throw new Error('REPORT_LENGTH_MISMATCH');
    await ReportJob.updateOne({ _id: id, requesterId: admin.accountId }, { $set: { downloadedAt: new Date() } });
    await audit(admin, request, 'success', id, {
      reportType: job.reportType,
      format: job.format,
      rowCount: job.rowCount,
      byteLength: buffer.length,
      includeCustomerDetails: job.includeCustomerDetails,
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': job.contentType,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="${job.filename}"`,
        'X-Report-SHA256': job.checksumSha256 ?? '',
      },
    });
  } catch (error) {
    await audit(admin, request, 'failure', id, { reason: 'download_failed' });
    logServerError({ route: 'GET /api/admin/reports/:id/download', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'REPORT_DOWNLOAD_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
