'use client';

import { CSRF_HEADER_NAME } from '@/lib/csrf';

type ErrorPayload = {
  error?: string;
  message?: string;
  details?: unknown;
  retryAfter?: number;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly retryAfter?: number;
  readonly requestUrl?: string;
  readonly requestMethod?: string;
  readonly requestId?: string;
  readonly operation?: string;

  constructor(status: number, payload: ErrorPayload | null, context: {
    requestUrl?: string;
    requestMethod?: string;
    requestId?: string | null;
    operation?: string | null;
  } = {}) {
    const code = payload?.error || `HTTP_${status}`;
    super(payload?.message || defaultErrorMessage(code, status));
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = payload?.details;
    this.retryAfter = payload?.retryAfter;
    this.requestUrl = context.requestUrl;
    this.requestMethod = context.requestMethod;
    this.requestId = context.requestId ?? undefined;
    this.operation = context.operation ?? undefined;
  }
}

function defaultErrorMessage(code: string, status: number): string {
  const known: Record<string, string> = {
    WORKER_LOCATION_MISMATCH: 'This worker is assigned to a different counter. Ask an administrator to update the assignment.',
    INSUFFICIENT_STOCK: 'The requested quantity is no longer available.',
    INVENTORY_NOT_CONFIGURED: 'This item cannot be ordered until its inventory is configured.',
    VALIDATION_FAILED: 'Check the submitted fields and try again.',
    STALE_ORDER_VERSION: 'This record changed elsewhere. Refresh and try again.',
    INVALID_ORDER_TRANSITION: 'That status change is not allowed.',
    RATE_LIMITED: 'Too many requests. Wait briefly and try again.',
    TOO_MANY_REQUESTS: 'Too many requests. Wait briefly and try again.',
  };
  if (known[code]) return known[code];
  if (status === 401) return 'Your session is missing or has expired. Sign in and try again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested record was not found.';
  if (status === 409) return 'The request conflicts with the latest saved state. Refresh and try again.';
  if (status === 400 || status === 422) return 'Check the submitted information and try again.';
  if (status === 429) return 'Too many requests. Wait briefly and try again.';
  if (status === 503) return 'This service is temporarily unavailable. Try again shortly.';
  return 'The request could not be completed.';
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  /** Avoid emitting the global expiry event for expected anonymous probes such as /auth/me. */
  suppressSessionExpiry?: boolean;
};

type CsrfResponse = { ok: true; csrfToken: string; expiresAt: number };

let csrfState: { token: string; expiresAt: number } | null = null;
let csrfRequest: Promise<string> | null = null;
let authChannel: BroadcastChannel | null = null;

function channel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!authChannel) authChannel = new BroadcastChannel('shatvika-auth');
  return authChannel;
}

function announce(type: 'csrf' | 'session-expired', data?: { token: string; expiresAt: number }) {
  channel()?.postMessage({ type, ...data });
}

if (typeof window !== 'undefined') {
  channel()?.addEventListener('message', event => {
    const message = event.data as { type?: string; token?: unknown; expiresAt?: unknown } | null;
    if (message?.type === 'csrf' && typeof message.token === 'string' && typeof message.expiresAt === 'number') {
      csrfState = { token: message.token, expiresAt: message.expiresAt };
    }
    if (message?.type === 'session-expired') {
      window.dispatchEvent(new Event('shatvika:session-expired'));
    }
  });
}

export function clearApiClientSession() {
  csrfState = null;
  announce('session-expired');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('shatvika:session-expired'));
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  const text = await response.text();
  return text || null;
}

async function csrfToken(force = false): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!force && csrfState && csrfState.expiresAt > nowSeconds + 60) return csrfState.token;
  if (!force && csrfRequest) return csrfRequest;

  csrfRequest = (async () => {
    const response = await fetch('/api/csrf', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const payload = await parseResponse(response) as CsrfResponse | ErrorPayload | null;
    if (!response.ok || !payload || !('csrfToken' in payload) || typeof payload.csrfToken !== 'string') {
      throw new ApiClientError(response.status, payload as ErrorPayload | null, {
        requestUrl: '/api/csrf',
        requestMethod: 'GET',
        requestId: response.headers.get('x-request-id'),
        operation: response.headers.get('x-shatvika-operation'),
      });
    }
    csrfState = { token: payload.csrfToken, expiresAt: payload.expiresAt };
    announce('csrf', csrfState);
    return payload.csrfToken;
  })();

  try {
    return await csrfRequest;
  } finally {
    csrfRequest = null;
  }
}

function isUnsafe(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function prepareBody(body: ApiRequestOptions['body'], headers: Headers): BodyInit | null | undefined {
  if (body === undefined || body === null || typeof body === 'string' || body instanceof FormData ||
      body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer) {
    return body as BodyInit | null | undefined;
  }
  headers.set('Content-Type', 'application/json');
  return JSON.stringify(body);
}

async function execute(url: string, options: ApiRequestOptions, retryCsrf: boolean): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  if (isUnsafe(method)) headers.set(CSRF_HEADER_NAME, await csrfToken(retryCsrf));
  const response = await fetch(url, {
    ...options,
    method,
    headers,
    body: prepareBody(options.body, headers),
    credentials: options.credentials ?? 'include',
  });

  if (!retryCsrf && response.status === 403) {
    const clonePayload = await parseResponse(response.clone()) as ErrorPayload | null;
    if (clonePayload?.error === 'CSRF_VALIDATION_FAILED' || clonePayload?.error === 'CSRF_TOKEN_EXPIRED') {
      csrfState = null;
      return execute(url, options, true);
    }
  }
  return response;
}

/** Typed, same-origin API request with signed-CSRF renewal and consistent errors. */
export async function apiRequest<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!url.startsWith('/') || url.startsWith('//')) {
    throw new Error('apiRequest only accepts same-origin relative paths');
  }
  const response = await execute(url, options, false);
  const payload = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && !options.suppressSessionExpiry) clearApiClientSession();
    throw new ApiClientError(response.status, payload as ErrorPayload | null, {
      requestUrl: url,
      requestMethod: (options.method ?? 'GET').toUpperCase(),
      requestId: response.headers.get('x-request-id'),
      operation: response.headers.get('x-shatvika-operation'),
    });
  }
  return payload as T;
}
