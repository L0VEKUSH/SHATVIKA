import { NextResponse } from 'next/server';
import { clearWorkerSession } from '@/lib/workerJwt';

export async function POST() {
  await clearWorkerSession();
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
