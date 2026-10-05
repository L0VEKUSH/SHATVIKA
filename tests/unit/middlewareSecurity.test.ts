import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createCsrfToken } from '@/lib/csrf';
import { signSessionToken } from '@/lib/sessionToken';
import { WORKER_COOKIE_NAME } from '@/lib/workerSessionConfig';
import { config, middleware } from '@/middleware';

const SECRET = 'middleware-test-secret-longer-than-thirty-two-bytes';

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.CSRF_SECRET;
  delete process.env.WORKER_JWT_SECRET;
});

describe('request boundary security', () => {
  it('runs on public pages so security headers are not limited to API and account routes', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)']);
  });

  it('adds the documented security policy and a correlation identifier', async () => {
    const response = await middleware(new NextRequest('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-eval'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('allows eval-backed Next.js refresh tooling only in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await middleware(new NextRequest('http://localhost/api/health'));
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
  });

  it('keeps unsafe eval out of the production policy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await middleware(new NextRequest('https://example.test/api/health'));
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-eval'");
    expect(response.headers.get('content-security-policy')).toContain('upgrade-insecure-requests');
  });

  it('rejects an unsafe API request without an origin and CSRF proof', async () => {
    const response = await middleware(new NextRequest('http://localhost/api/contact', { method: 'POST' }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'UNTRUSTED_ORIGIN' });
  });

  it('accepts a same-origin unsafe request with matching valid CSRF proof', async () => {
    process.env.CSRF_SECRET = SECRET;
    const token = await createCsrfToken({ secret: SECRET });
    const response = await middleware(new NextRequest('http://localhost/api/contact', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: `csrf_token=${token}`,
        'x-csrf-token': token,
      },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/admin/api/login', '/api/auth/signup'])(
    'allows the public auth endpoint %s through after valid same-origin CSRF validation',
    async pathname => {
      process.env.CSRF_SECRET = SECRET;
      const token = await createCsrfToken({ secret: SECRET });
      const response = await middleware(new NextRequest(`http://localhost${pathname}`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          cookie: `csrf_token=${token}`,
          'x-csrf-token': token,
        },
      }));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('preserves the intended local destination when redirecting an anonymous customer', async () => {
    const response = await middleware(new NextRequest('http://localhost/customer/orders?page=2'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? 'http://invalid');
    expect(location.pathname).toBe('/auth/login');
    expect(location.searchParams.get('returnTo')).toBe('/customer/orders?page=2');
  });

  it('keeps same-browser guest order history public at the page boundary while API ownership remains server-enforced', async () => {
    const response = await middleware(new NextRequest('http://localhost/orders'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps the counter dashboard worker-only and rejects a customer-role token', async () => {
    process.env.WORKER_JWT_SECRET = SECRET;
    const customerToken = await signSessionToken({
      accountId: '507f1f77bcf86cd799439011', role: 'customer', sessionVersion: 0,
      lifetimeSeconds: 600, secret: SECRET, tokenId: 'customer-counter-boundary-test',
    });
    const rejected = await middleware(new NextRequest('http://localhost/counter', {
      headers: { cookie: `${WORKER_COOKIE_NAME}=${customerToken}` },
    }));
    expect(rejected.status).toBe(307);
    expect(new URL(rejected.headers.get('location') ?? 'http://invalid').pathname).toBe('/counter/login');

    const workerToken = await signSessionToken({
      accountId: '507f1f77bcf86cd799439012', role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 600, secret: SECRET, tokenId: 'valid-worker-boundary-test',
    });
    const accepted = await middleware(new NextRequest('http://localhost/counter', {
      headers: { cookie: `${WORKER_COOKIE_NAME}=${workerToken}` },
    }));
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects unauthenticated counter pages and returns JSON 401 for counter APIs', async () => {
    process.env.WORKER_JWT_SECRET = SECRET;
    const page = await middleware(new NextRequest('http://localhost/counter/orders?view=ready'));
    expect(page.status).toBe(307);
    const location = new URL(page.headers.get('location') ?? 'http://invalid');
    expect(location.pathname).toBe('/counter/login');
    expect(location.searchParams.get('returnTo')).toBe('/counter/orders?view=ready');

    const api = await middleware(new NextRequest('http://localhost/counter/api/private', {
      headers: { accept: 'application/json' },
    }));
    expect(api.status).toBe(401);
    await expect(api.json()).resolves.toEqual({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('does not make routes below the login endpoint public by prefix matching', async () => {
    process.env.WORKER_JWT_SECRET = SECRET;
    const response = await middleware(new NextRequest('http://localhost/counter/api/login/private', {
      headers: { accept: 'application/json' },
    }));
    expect(response.status).toBe(401);
  });

  it('keeps worker logout POST-only and CSRF protected even when no session is present', async () => {
    process.env.WORKER_JWT_SECRET = SECRET;
    const response = await middleware(new NextRequest('http://localhost/counter/api/logout', {
      method: 'POST',
      headers: { accept: 'application/json' },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'UNTRUSTED_ORIGIN' });
  });
});
