import { verifySessionToken } from '@/lib/sessionToken';
import { workerSessionConfigurationError } from '@/lib/workerSessionConfig';

export async function verifyWorkerToken(token: string): Promise<boolean> {
  if (workerSessionConfigurationError()) return false;
  return Boolean(await verifySessionToken({
    token, role: 'worker', secret: process.env.WORKER_JWT_SECRET as string,
  }));
}
