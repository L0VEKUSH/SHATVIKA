import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use /api/upload for file uploads.' },
    { status: 405 }
  );
}

export function POST() {
  return NextResponse.json(
    { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use /api/upload for file uploads.' },
    { status: 405 }
  );
}
