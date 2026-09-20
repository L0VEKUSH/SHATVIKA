import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assessRuntimeConfiguration } from '@/lib/health';
import { connectToMongo } from '@/lib/mongoose';
import { logServerError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const PRIVATE_HEALTH_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
};

function requestIdFor(request: NextRequest): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

async function checkDatabase(requestId: string): Promise<'ok' | 'not_configured' | 'unavailable'> {
  if (!process.env.MONGODB_URI?.trim()) return 'not_configured';

  try {
    const mongo = await connectToMongo();
    const database = mongo.connection.db;
    if (!database || mongo.connection.readyState !== 1) return 'unavailable';
    await database.admin().ping();
    return 'ok';
  } catch (error) {
    logServerError({ route: 'GET /api/health', err: error, requestId });
    return 'unavailable';
  }
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFor(request);
  const [database, configuration] = await Promise.all([
    checkDatabase(requestId),
    Promise.resolve(assessRuntimeConfiguration()),
  ]);
  const ready = database === 'ok' && configuration.ready;

  return NextResponse.json({
    ok: ready,
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    requestId,
    checks: {
      database,
      configuration: configuration.ready ? 'ready' : 'incomplete',
    },
    configuration: {
      required: configuration.required,
      integrations: configuration.integrations,
    },
  }, {
    status: ready ? 200 : 503,
    headers: PRIVATE_HEALTH_HEADERS,
  });
}
