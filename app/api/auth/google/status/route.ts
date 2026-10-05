import { NextResponse } from 'next/server';
import { googleOidcSettings } from '@/lib/googleOidc';

export function GET() {
  const available = Boolean(googleOidcSettings());
  return NextResponse.json({
    ok: true,
    available,
    message: available
      ? 'Google sign-in is available.'
      : 'Google sign-in is not configured. Guest checkout remains available.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
