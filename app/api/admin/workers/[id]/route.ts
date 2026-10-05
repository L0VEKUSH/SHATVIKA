import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeWorkerManagement } from '@/lib/adminWorkerAccess';
import { logServerError } from '@/lib/apiError';
import { configuredCounterLocation, getCounterLocationConfiguration } from '@/lib/locations';
import { distributedRateLimit } from '@/lib/rateLimit';
import { validatePassword } from '@/lib/validators';
import { AuditEvent } from '@/models/AuditEvent';
import { Worker } from '@/models/Worker';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate') }).strict(),
  z.object({ action: z.literal('deactivate') }).strict(),
  z.object({
    action: z.literal('reset_password'),
    password: z.string().min(12).max(128),
  }).strict().superRefine((value, context) => {
    for (const message of validatePassword(value.password).errors) {
      context.addIssue({ code: 'custom', path: ['password'], message });
    }
  }),
  z.object({
    action: z.literal('assign_location'),
    locationId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
  }).strict(),
]);

function publicWorker(worker: any, configuredLocationId: string) {
  return { id: String(worker._id), name: worker.name, email: worker.email, locationId: worker.locationId, locationMatches: worker.locationId === configuredLocationId, permissions: worker.permissions ?? [], isActive: worker.isActive === true, updatedAt: worker.updatedAt };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeWorkerManagement();
  if (!authorization.ok) return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_WORKER_ID' }, { status: 400 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  const configuredLocationId = getCounterLocationConfiguration().location.id;
  const assignedLocation = parsed.data.action === 'assign_location'
    ? configuredCounterLocation(parsed.data.locationId)
    : null;
  if (parsed.data.action === 'assign_location' && !assignedLocation) {
    return NextResponse.json({
      ok: false,
      error: 'INVALID_COUNTER_LOCATION',
      expectedLocationId: configuredLocationId,
    }, { status: 400 });
  }
  try {
    const limited = await distributedRateLimit(`admin-worker-update:${authorization.adminId}`, 30, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS' }, { status: 429 });
    let update: Record<string, unknown>;
    if (parsed.data.action === 'activate') update = { $set: { isActive: true } };
    else if (parsed.data.action === 'deactivate') update = { $set: { isActive: false }, $inc: { passwordVersion: 1 } };
    else if (parsed.data.action === 'assign_location') update = { $set: { locationId: assignedLocation!.id }, $inc: { passwordVersion: 1 } };
    else update = { $set: { password: await bcrypt.hash(parsed.data.password, 12) }, $inc: { passwordVersion: 1 } };

    const worker = await Worker.findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true });
    if (!worker) return NextResponse.json({ ok: false, error: 'WORKER_NOT_FOUND' }, { status: 404 });
    await AuditEvent.create({
      actorType: 'admin', actorId: authorization.adminId, action: `worker.${parsed.data.action}`,
      resourceType: 'worker', resourceId: id, correlationId: request.headers.get('x-request-id'),
      outcome: 'success', metadata: parsed.data.action === 'assign_location' ? { locationId: assignedLocation!.id } : {},
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, worker: publicWorker(worker, configuredLocationId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logServerError({ route: 'PATCH /api/admin/workers/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'WORKER_UPDATE_FAILED' }, { status: 500 });
  }
}
