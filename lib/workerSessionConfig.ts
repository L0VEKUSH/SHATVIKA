export const WORKER_COOKIE_NAME = 'shatvika_worker_session';
export const WORKER_SESSION_SECONDS = 12 * 60 * 60;

export type WorkerSessionConfigurationIssue =
  | 'missing'
  | 'too_short'
  | 'not_independent';

export function workerSessionConfigurationIssue(
  source: Record<string, string | undefined> = process.env,
): WorkerSessionConfigurationIssue | null {
  const secret = source.WORKER_JWT_SECRET ?? '';
  if (!secret.trim()) return 'missing';
  if (new TextEncoder().encode(secret).byteLength < 32) return 'too_short';
  if (
    secret === source.ADMIN_JWT_SECRET ||
    secret === source.CUSTOMER_JWT_SECRET
  ) {
    return 'not_independent';
  }
  return null;
}

export function workerSessionConfigurationError(
  source: Record<string, string | undefined> = process.env,
): string | null {
  const issue = workerSessionConfigurationIssue(source);
  if (issue === 'missing') return 'WORKER_JWT_SECRET is not configured';
  if (issue === 'too_short') return 'WORKER_JWT_SECRET must contain at least 32 bytes';
  if (issue === 'not_independent') {
    return 'WORKER_JWT_SECRET must be independent from admin and customer session secrets';
  }
  return null;
}

export function getWorkerSessionSecret(): string {
  const error = workerSessionConfigurationError();
  if (error) throw new Error('WORKER_SESSION_CONFIGURATION_INVALID');
  return process.env.WORKER_JWT_SECRET as string;
}
