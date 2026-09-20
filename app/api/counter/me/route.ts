import { NextResponse } from 'next/server';
import { getWorkerSessionState } from '@/lib/workerJwt';

export const dynamic = 'force-dynamic';

export async function GET() {
  const worker = await getWorkerSessionState();
  if (worker.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (worker.status !== 'valid' || !worker.permissions.includes('counter:operate')) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    worker: {
      id: worker.accountId,
      name: worker.name,
      locationId: worker.locationId,
      permissions: worker.permissions,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
