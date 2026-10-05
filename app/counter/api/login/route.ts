import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { authRateLimit } from '@/lib/authRateLimit';
import { logServerError } from '@/lib/apiError';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { configuredCounterLocation } from '@/lib/locations';
import { connectToMongo } from '@/lib/mongoose';
import { setWorkerSession, workerSessionConfigurationError } from '@/lib/workerJwt';
import { workerSessionConfigurationIssue } from '@/lib/workerSessionConfig';
import { validateEmail } from '@/lib/validators';
import { Worker } from '@/models/Worker';

const FAKE_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!validateEmail(email).valid || !password || password.length > 128) {
    return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }, { status: 401 });
  }
  try {
    const limited = await authRateLimit({ request, scope: 'worker-login', subject: email, limit: 5, windowSeconds: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } });
  } catch {
    return NextResponse.json({ ok: false, error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503 });
  }
  if (workerSessionConfigurationError()) {
    const configurationIssue = workerSessionConfigurationIssue() ?? 'unknown';
    if (process.env.NODE_ENV !== 'test') {
      console.error(JSON.stringify({
        level: 'error',
        event: 'worker_session_configuration_invalid',
        configurationIssue,
        timestamp: new Date().toISOString(),
      }));
    }
    return NextResponse.json({ ok: false, error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
  try {
    await connectToMongo();
    const worker = await Worker.findOne({ email }).select('+password +passwordVersion name role locationId permissions isActive').lean();
    const matches = await bcrypt.compare(password, worker?.password ?? FAKE_HASH);
    if (!worker || !matches || !worker.isActive || worker.role !== 'worker' || !worker.permissions?.includes('counter:operate')) {
      return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }, { status: 401 });
    }
    const configuredLocationId = getFulfillmentCapabilities().locationId;
    const assignedLocation = configuredCounterLocation(worker.locationId);
    if (!assignedLocation || assignedLocation.id !== configuredLocationId) {
      return NextResponse.json({
        ok: false,
        error: 'WORKER_LOCATION_MISMATCH',
        message: 'This worker is not assigned to the configured counter location. Ask an administrator to update the assignment.',
      }, { status: 403 });
    }
    await setWorkerSession(String(worker._id), worker.passwordVersion ?? 0);
    return NextResponse.json({ ok: true, worker: { name: worker.name, locationId: assignedLocation.id } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'POST /counter/api/login', err: error });
    return NextResponse.json({ ok: false, error: 'AUTH_UNAVAILABLE' }, { status: 503 });
  }
}
