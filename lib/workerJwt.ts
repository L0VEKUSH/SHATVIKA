import { cookies } from 'next/headers';
import { connectToMongo } from '@/lib/mongoose';
import { signSessionToken, verifySessionToken, type SessionClaims } from '@/lib/sessionToken';
import {
  getWorkerSessionSecret,
  WORKER_COOKIE_NAME,
  WORKER_SESSION_SECONDS,
  workerSessionConfigurationError,
} from '@/lib/workerSessionConfig';
import { Worker } from '@/models/Worker';
import { configuredCounterLocation } from '@/lib/locations';

export { WORKER_COOKIE_NAME, workerSessionConfigurationError } from '@/lib/workerSessionConfig';

export type WorkerSessionState =
  | { status: 'valid'; accountId: string; claims: SessionClaims; name: string; locationId: string; permissions: string[] }
  | { status: 'invalid' | 'account_disabled' | 'database_unavailable' };

export async function verifyWorkerTokenState(token: string): Promise<WorkerSessionState> {
  if (workerSessionConfigurationError()) return { status: 'invalid' };
  const claims = await verifySessionToken({ token, role: 'worker', secret: getWorkerSessionSecret() });
  if (!claims) return { status: 'invalid' };
  try {
    await connectToMongo();
    const worker = await Worker.findById(claims.sub)
      .select('+passwordVersion name locationId permissions isActive role')
      .lean();
    if (!worker || worker.role !== 'worker') return { status: 'invalid' };
    if (!worker.isActive) return { status: 'account_disabled' };
    if (!Number.isSafeInteger(worker.passwordVersion) || worker.passwordVersion !== claims.sv) return { status: 'invalid' };
    const permissions = Array.isArray(worker.permissions) ? worker.permissions.map(String) : [];
    if (!permissions.includes('counter:operate')) return { status: 'invalid' };
    const location = configuredCounterLocation(worker.locationId);
    if (!location) return { status: 'invalid' };
    return {
      status: 'valid', accountId: claims.sub, claims,
      name: worker.name, locationId: location.id,
      permissions,
    };
  } catch {
    return { status: 'database_unavailable' };
  }
}

export async function getWorkerSessionState(): Promise<WorkerSessionState> {
  const store = await cookies();
  const token = store.get(WORKER_COOKIE_NAME)?.value;
  return token ? verifyWorkerTokenState(token) : { status: 'invalid' };
}

export async function setWorkerSession(workerId: string, passwordVersion = 0) {
  const token = await signSessionToken({
    accountId: workerId, role: 'worker', sessionVersion: passwordVersion,
    lifetimeSeconds: WORKER_SESSION_SECONDS, secret: getWorkerSessionSecret(),
  });
  const store = await cookies();
  store.set(WORKER_COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: WORKER_SESSION_SECONDS, priority: 'high',
  });
}

export async function clearWorkerSession() {
  const store = await cookies();
  store.set(WORKER_COOKIE_NAME, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: 0, expires: new Date(0),
  });
}
