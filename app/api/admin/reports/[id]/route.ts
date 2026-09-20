import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { getAdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { ReportJob } from '@/models/ReportJob';

export const dynamic = 'force-dynamic';
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSessionState();
  if (admin.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401, headers: PRIVATE_HEADERS });
  }
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, error: 'INVALID_REPORT_ID' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const job = await ReportJob.findOne({ _id: id, requesterId: admin.accountId }).select('+requesterId').lean();
    if (!job) return NextResponse.json({ ok: false, error: 'REPORT_NOT_FOUND' }, { status: 404, headers: PRIVATE_HEADERS });
    return NextResponse.json({
      ok: true,
      report: {
        id, reportType: job.reportType, format: job.format, rowCount: job.rowCount, status: job.status,
        asOfUtc: job.asOfUtc, generatedAt: job.generatedAt, downloadedAt: job.downloadedAt,
        expiresAt: job.expiresAt, expired: job.expiresAt <= new Date(), byteLength: job.byteLength,
      },
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    logServerError({ route: 'GET /api/admin/reports/:id', err: error });
    return NextResponse.json({ ok: false, error: 'REPORT_LOOKUP_FAILED' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
