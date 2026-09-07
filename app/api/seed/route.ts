import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';

/**
 * SECURE SEED ENDPOINT
 * 
 * This endpoint is DISABLED in production.
 * Purpose: Disabled. No seeding allowed.
 * 
 * All HTTP methods return 410 (Gone) to indicate this functionality is permanently unavailable.
 * This prevents accidental data injection via seed endpoints.
 * 
 * For production-safe seeding, use admin dashboard or direct MongoDB client.
 */
export const dynamic = 'force-dynamic';

const DISABLED_MESSAGE = {
  ok: false,
  error: 'SEED_DISABLED',
  message:
    'Seeding is disabled. Create items/content via the admin panel so only real MongoDB data is shown.',
};

/**
 * GET /api/seed
 * Returns 410 Gone - endpoint is permanently disabled
 */
export async function GET(req: NextRequest) {
  // Log attempt (security audit trail)
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  console.warn(`[GET /api/seed] Seed endpoint access attempt from ${clientIp}`);

  try {
    await connectToMongo();
  } catch (err) {
    console.error('[GET /api/seed] DB connection failed:', err);
    return NextResponse.json({ error: 'DB_UNAVAILABLE' }, { status: 503 });
  }

  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}

/**
 * POST /api/seed
 * Returns 410 Gone - endpoint is permanently disabled
 */
export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  console.warn(`[POST /api/seed] Seed endpoint access attempt from ${clientIp}`);

  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}

/**
 * PUT /api/seed
 * Returns 410 Gone - endpoint is permanently disabled
 */
export async function PUT(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  console.warn(`[PUT /api/seed] Seed endpoint access attempt from ${clientIp}`);

  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}

/**
 * DELETE /api/seed
 * Returns 410 Gone - endpoint is permanently disabled
 */
export async function DELETE(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  console.warn(`[DELETE /api/seed] Seed endpoint access attempt from ${clientIp}`);

  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}

/**
 * PATCH /api/seed
 * Returns 410 Gone - endpoint is permanently disabled
 */
export async function PATCH(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  console.warn(`[PATCH /api/seed] Seed endpoint access attempt from ${clientIp}`);

  return NextResponse.json(DISABLED_MESSAGE, { status: 410 });
}
