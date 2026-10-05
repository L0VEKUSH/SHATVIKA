import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderServiceError, recordCounterPayment } from '@/lib/orders/service';
import { distributedRateLimit } from '@/lib/rateLimit';
import { getWorkerSessionState } from '@/lib/workerJwt';
import { logServerError } from '@/lib/apiError';

const paymentSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  method: z.enum(['cash', 'upi']),
  amountPaise: z.number().int().positive(),
  transactionReference: z.string().trim().min(3).max(160).optional(),
  merchantReceiptVerified: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.method === 'upi' && !value.merchantReceiptVerified) {
    context.addIssue({ code: 'custom', path: ['merchantReceiptVerified'], message: 'Verify receipt in the merchant payment source' });
  }
  if (value.method === 'upi' && !value.transactionReference) {
    context.addIssue({ code: 'custom', path: ['transactionReference'], message: 'UPI transaction reference is required' });
  }
});

export async function POST(request: NextRequest) {
  const worker = await getWorkerSessionState();
  if (worker.status === 'database_unavailable') {
    return NextResponse.json({ ok: false, error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
  if (worker.status !== 'valid' || !worker.permissions.includes('counter:operate')) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const limited = await distributedRateLimit(`counter-payment:${worker.accountId}`, 60, 60);
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, { status: 429 });
    }
    const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    const result = await recordCounterPayment({
      orderId: parsed.data.orderId,
      action: 'collect',
      method: parsed.data.method,
      amountPaise: parsed.data.amountPaise,
      actorId: worker.accountId,
      actorType: 'worker',
      actorName: worker.name,
      idempotencyKey,
      transactionReference: parsed.data.transactionReference,
      receiptVerified: parsed.data.merchantReceiptVerified,
      note: parsed.data.note,
      requiredLocationId: worker.locationId,
    });
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      paymentEventId: String(result.event._id),
      order: {
        id: String(result.order._id),
        paymentStatus: result.order.paymentStatus,
        paymentMethod: result.order.paymentMethod,
        collectedPaise: Number(result.order.collectedPaise ?? 0),
        refundedPaise: Number(result.order.refundedPaise ?? 0),
        refundDuePaise: Number(result.order.refundDuePaise ?? 0),
        stateVersion: Number(result.order.stateVersion ?? 0),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return NextResponse.json({ ok: false, error: error.code, details: error.details }, { status: error.status });
    }
    logServerError({ route: 'POST /api/counter/payments', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'PAYMENT_RECORDING_FAILED' }, { status: 500 });
  }
}
