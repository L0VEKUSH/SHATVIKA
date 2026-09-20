import { verifySessionToken } from '@/lib/sessionToken';

export async function verifyWorkerToken(token: string): Promise<boolean> {
  return Boolean(await verifySessionToken({
    token, role: 'worker', secret: process.env.WORKER_JWT_SECRET ?? '',
  }));
}
