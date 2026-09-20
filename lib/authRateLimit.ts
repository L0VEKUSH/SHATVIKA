import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';

export async function authRateLimit(input: {
  request: Request;
  scope: string;
  limit: number;
  windowSeconds: number;
  subject?: string | null;
}) {
  const keys = [`auth:${input.scope}:ip:${getClientIp(input.request)}`];
  if (input.subject) keys.push(`auth:${input.scope}:subject:${input.subject.trim().toLowerCase()}`);
  const results = await Promise.all(keys.map(key => distributedRateLimit(key, input.limit, input.windowSeconds)));
  const denied = results.find(result => !result.allowed);
  return denied ?? {
    allowed: true,
    remaining: Math.min(...results.map(result => result.remaining ?? input.limit)),
  };
}
