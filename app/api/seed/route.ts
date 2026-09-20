import { NextResponse } from 'next/server';

/**
 * HTTP seeding is permanently unavailable in every environment. Test fixtures
 * use an isolated database through the test runner instead of a public route.
 */
export const dynamic = 'force-dynamic';

const DISABLED_MESSAGE = {
  ok: false,
  error: 'SEED_DISABLED',
  message: 'HTTP seeding is disabled. Use the authorized admin tools or isolated test fixtures.',
} as const;

function disabled() {
  return NextResponse.json(DISABLED_MESSAGE, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const GET = disabled;
export const POST = disabled;
export const PUT = disabled;
export const PATCH = disabled;
export const DELETE = disabled;
