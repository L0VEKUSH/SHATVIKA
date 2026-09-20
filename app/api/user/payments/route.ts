import { NextResponse } from 'next/server';
import { getCustomerSessionState } from '@/lib/customerJwt';

export const dynamic = 'force-dynamic';

async function authorize() {
  const state = await getCustomerSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHENTICATED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  return null;
}

export async function GET() {
  const authError = await authorize();
  if (authError) return authError;
  return NextResponse.json({
    ok: true,
    paymentMethods: [],
    availableMethods: ['cash'],
    onlinePaymentsConfigured: false,
    message: 'Online payment storage and processing are disabled until a verified provider is configured.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
  const authError = await authorize();
  if (authError) return authError;
  return NextResponse.json({
    ok: false,
    error: 'PAYMENT_PROVIDER_UNAVAILABLE',
    availableMethods: ['cash'],
    message: 'Saving payment labels is disabled because no verified payment provider is configured.',
  }, { status: 503 });
}
