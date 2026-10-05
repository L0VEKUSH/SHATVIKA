import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { ORDER_STATUSES } from '@/lib/orders/stateMachine';
import { Order } from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAdminSessionState();
  if (session.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (session.status !== 'valid') {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    await connectToMongo();
    const pageRaw = Number(request.nextUrl.searchParams.get('page') ?? 1);
    const pageSizeRaw = Number(request.nextUrl.searchParams.get('pageSize') ?? 50);
    const page = Number.isInteger(pageRaw) ? Math.max(1, pageRaw) : 1;
    const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 50;
    const status = request.nextUrl.searchParams.get('status');
    if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });
    }
    const filter = status ? { orderStatus: status } : {};
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .select('-requestFingerprint -idempotencyKey')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Order.countDocuments(filter),
    ]);
    return NextResponse.json(
      { ok: true, orders, page, pageSize, total, pages: Math.ceil(total / pageSize) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    logServerError({ route: 'GET /api/orders', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use customer checkout to create an order.' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
