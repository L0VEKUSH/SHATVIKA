import { cookies } from 'next/headers';
import { connectToMongo } from '@/lib/mongoose';
import { signSessionToken, verifySessionToken, type SessionClaims } from '@/lib/sessionToken';
import { Worker } from '@/models/Worker';

export const WORKER_COOKIE_NAME = 'worker_session';
const WORKER_SESSION_SECONDS = 12 * 60 * 60;

export type WorkerSessionState =
  | { status: 'valid'; accountId: string; claims: SessionClaims; name: string; locationId: string; permissions: string[] }
  | { status: 'invalid' | 'account_disabled' | 'database_unavailable' };

function secret() {
  return process.env.WORKER_JWT_SECRET ?? '';
}

export function workerSessionConfigurationError(): string | null {
  const value = secret();
  if (!value) return 'WORKER_JWT_SECRET is not configured';
  if (process.env.NODE_ENV === 'production' && new TextEncoder().encode(value).byteLength < 32) {
    return 'WORKER_JWT_SECRET must contain at least 32 bytes in production';
  }
  return null;
}

export async function verifyWorkerTokenState(token: string): Promise<WorkerSessionState> {
  const claims = await verifySessionToken({ token, role: 'worker', secret: secret() });
  if (!claims) return { status: 'invalid' };
  try {
    await connectToMongo();
    const worker = await Worker.findById(claims.sub)
      .select('+passwordVersion name locationId permissions isActive role')
      .lean();
    if (!worker || worker.role !== 'worker') return { status: 'invalid' };
    if (!worker.isActive) return { status: 'account_disabled' };
    if (!Number.isSafeInteger(worker.passwordVersion) || worker.passwordVersion !== claims.sv) return { status: 'invalid' };
    return {
      status: 'valid', accountId: claims.sub, claims,
      name: worker.name, locationId: worker.locationId,
      permissions: worker.permissions.map(String),
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
    lifetimeSeconds: WORKER_SESSION_SECONDS, secret: secret(),
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
