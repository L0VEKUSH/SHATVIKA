import { NextResponse } from 'next/server';

const SENSITIVE_KEY = /(?:password|secret|token|authorization|cookie|email|phone|address|customer|payload|body|uri)/i;

function safeErrorMeta(error: unknown): { name: string; code?: string | number } {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };
  const value = error as { name?: unknown; code?: unknown };
  const name = typeof value.name === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value.name)
    ? value.name
    : 'Error';
  const code = typeof value.code === 'number'
    ? value.code
    : typeof value.code === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value.code)
      ? value.code
      : undefined;
  return { name, ...(code === undefined ? {} : { code }) };
}

function redactMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (SENSITIVE_KEY.test(key)) return [key, '[REDACTED]'];
    if (typeof entry === 'string') return [key, entry.slice(0, 160)];
    if (typeof entry === 'number' || typeof entry === 'boolean' || entry === null) return [key, entry];
    return [key, '[OMITTED]'];
  }));
}

/** Structured server logging that deliberately excludes messages, stacks, and request/customer data. */
export function logServerError(params: {
  route: string;
  err: unknown;
  requestId?: string | null;
  extra?: Record<string, unknown>;
}) {
  const record = {
    level: 'error',
    event: 'request_failure',
    route: params.route,
    requestId: params.requestId?.slice(0, 128) || undefined,
    error: safeErrorMeta(params.err),
    metadata: redactMetadata(params.extra),
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(record));
}

export function jsonError(params: {
  route: string;
  status: number;
  clientErrorCode: string;
  err?: unknown;
  requestId?: string | null;
  extraClient?: Record<string, unknown>;
}) {
  if (params.err !== undefined) {
    logServerError({ route: params.route, err: params.err, requestId: params.requestId });
  }
  return NextResponse.json({ ok: false, error: params.clientErrorCode, ...(params.extraClient ?? {}) }, { status: params.status });
}
