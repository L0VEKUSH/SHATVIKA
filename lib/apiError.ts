import { NextResponse } from 'next/server';

function safeErrString(err: unknown) {
  if (!err) return 'UnknownError';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  try {
    return JSON.stringify(err);
  } catch {
    return 'NonSerializableError';
  }
}

function getErrMeta(err: unknown): { name?: string; code?: unknown } {
  if (!err || typeof err !== 'object') return {};
  const anyErr = err as any;
  return { name: anyErr.name, code: anyErr.code };
}

export function logServerError(params: {
  route: string;
  err: unknown;
  extra?: Record<string, unknown>;
}) {
  const { route, err, extra } = params;
  const meta = getErrMeta(err);
  // Do not print secrets. Only print error message/code/name.
  console.error(`[${route}]`, {
    message: safeErrString(err),
    name: meta.name,
    code: meta.code,
    extra,
    // include stack when available
    stack: err instanceof Error ? err.stack : undefined,
  });
}

export function jsonError(params: {
  route: string;
  status: number;
  clientErrorCode: string;
  err?: unknown;
  extraClient?: Record<string, unknown>;
}) {
  const { route, status, clientErrorCode, err, extraClient } = params;
  // Keep client responses safe: only error code + generic message.
  // Optional extraClient should not contain secrets.
  return NextResponse.json(
    {
      ok: false,
      error: clientErrorCode,
      ...(extraClient ?? {}),
    },
    { status }
  );
}

