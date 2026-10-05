import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeWorkerManagement } from '@/lib/adminWorkerAccess';
import { logServerError } from '@/lib/apiError';
import {
  canonicalLocationId,
  configuredCounterLocation,
  getCounterLocationCatalog,
  getCounterLocationConfiguration,
} from '@/lib/locations';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { validateEmail, validatePassword } from '@/lib/validators';
import { AuditEvent } from '@/models/AuditEvent';
import { Worker } from '@/models/Worker';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(120).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
  locationId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/).optional(),
}).strict().superRefine((value, context) => {
  if (!validateEmail(value.email).valid) context.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
  for (const message of validatePassword(value.password).errors) {
    context.addIssue({ code: 'custom', path: ['password'], message });
  }
});

function publicWorker(worker: any, configuredLocationId: string) {
  let canonicalWorkerLocation = String(worker.locationId ?? '');
  try { canonicalWorkerLocation = canonicalLocationId(canonicalWorkerLocation); } catch { /* preserve invalid legacy value for repair */ }
  return {
    id: String(worker._id),
    name: worker.name,
    email: worker.email,
    locationId: canonicalWorkerLocation,
    locationMatches: canonicalWorkerLocation === configuredLocationId,
    permissions: worker.permissions ?? [],
    isActive: worker.isActive === true,
    createdAt: worker.createdAt,
    updatedAt: worker.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeWorkerManagement();
  if (!authorization.ok) return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  try {
    await connectToMongo();
    const pageInput = Number(request.nextUrl.searchParams.get('page') ?? 1);
    const limitInput = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const page = Number.isSafeInteger(pageInput) ? Math.max(1, pageInput) : 1;
    const limit = Number.isSafeInteger(limitInput) ? Math.min(100, Math.max(1, limitInput)) : 50;
    const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 120) ?? '';
    const locationConfiguration = getCounterLocationConfiguration();
    const configuredLocationId = locationConfiguration.location.id;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = search ? { $or: [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }, { locationId: { $regex: escaped, $options: 'i' } }] } : {};
    const [workers, total] = await Promise.all([
      Worker.find(filter).select('-password -passwordVersion').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Worker.countDocuments(filter),
    ]);
    return NextResponse.json({
      ok: true,
      workers: workers.map(worker => publicWorker(worker, configuredLocationId)),
      configuredLocationId,
      locations: getCounterLocationCatalog(),
      locationConfiguration: {
        explicit: locationConfiguration.explicit,
        warning: locationConfiguration.warning,
      },
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'GET /api/admin/workers', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'WORKERS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeWorkerManagement();
  if (!authorization.ok) return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  try {
    const limited = await distributedRateLimit(`admin-worker-create:${authorization.adminId}`, 10, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
    const locationConfiguration = getCounterLocationConfiguration();
    const configuredLocationId = locationConfiguration.location.id;
    const requestedLocation = parsed.data.locationId
      ? configuredCounterLocation(parsed.data.locationId)
      : locationConfiguration.location;
    if (!requestedLocation) {
      return NextResponse.json({
        ok: false,
        error: 'INVALID_COUNTER_LOCATION',
        expectedLocationId: configuredLocationId,
      }, { status: 400 });
    }
    await connectToMongo();
    if (await Worker.exists({ email: parsed.data.email })) {
      return NextResponse.json({ ok: false, error: 'WORKER_ALREADY_EXISTS' }, { status: 409 });
    }
    const worker = await Worker.create({
      name: parsed.data.name,
      email: parsed.data.email,
      password: await bcrypt.hash(parsed.data.password, 12),
      passwordVersion: 0,
      role: 'worker',
      locationId: requestedLocation.id,
      permissions: ['counter:operate'],
      isActive: true,
    });
    await AuditEvent.create({
      actorType: 'admin', actorId: authorization.adminId, action: 'worker.create',
      resourceType: 'worker', resourceId: String(worker._id),
      correlationId: request.headers.get('x-request-id'), outcome: 'success',
      metadata: { locationId: worker.locationId },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, worker: publicWorker(worker, configuredLocationId) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'WORKER_ALREADY_EXISTS' }, { status: 409 });
    }
    logServerError({ route: 'POST /api/admin/workers', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'WORKER_CREATE_FAILED' }, { status: 500 });
  }
}
