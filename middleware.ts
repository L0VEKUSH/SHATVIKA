import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/adminJwtEdge';
import { verifyCustomerToken } from '@/lib/customerJwtEdge';
import { verifyWorkerToken } from '@/lib/workerJwtEdge';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  isTrustedMutationOrigin,
  verifyCsrfToken,
} from '@/lib/csrf';
import { safeReturnPath } from '@/lib/returnPath';

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/signup', '/admin/api/login', '/admin/api/signup'];
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password'];
const PUBLIC_COUNTER_PATHS = ['/counter/login', '/counter/api/login'];
const PROTECTED_CUSTOMER_PATHS = ['/customer', '/profile', '/orders', '/checkout', '/addresses'];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function matchesPath(pathname: string, paths: readonly string[]) {
  return paths.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function requiresCsrf(pathname: string, method: string) {
  return UNSAFE_METHODS.has(method) && (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin/api/') ||
    pathname.startsWith('/counter/api/') ||
    pathname === '/admin/logout' ||
    pathname === '/counter/logout'
  );
}

function securityHeaders(response: NextResponse, requestId: string) {
  // Next.js development bundles use eval-backed source maps for React Refresh
  // and the devtools overlay. Keep this exception development-only; production
  // bundles and tests retain the stricter policy.
  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (process.env.NODE_ENV === 'development') scriptSources.push("'unsafe-eval'");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  ];
  if (process.env.NODE_ENV === 'production') directives.push('upgrade-insecure-requests');
  response.headers.set('Content-Security-Policy', directives.join('; '));
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('X-Request-Id', requestId);
  return response;
}

function getRequestId(request: NextRequest) {
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

async function hasValidAdminSession(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value;
  return token ? verifyAdminToken(token) : false;
}

async function hasValidCustomerSession(request: NextRequest) {
  const token = request.cookies.get('customer_session')?.value;
  return token ? verifyCustomerToken(token) : false;
}

async function hasValidWorkerSession(request: NextRequest) {
  const token = request.cookies.get('worker_session')?.value;
  return token ? verifyWorkerToken(token) : false;
}

function nextResponse(request: NextRequest, requestId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  return securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const requestId = getRequestId(request);

  if (requiresCsrf(pathname, method)) {
    if (!isTrustedMutationOrigin({
      requestOrigin: request.nextUrl.origin,
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    })) {
      return securityHeaders(NextResponse.json({ ok: false, error: 'UNTRUSTED_ORIGIN' }, { status: 403 }), requestId);
    }

    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return securityHeaders(NextResponse.json({ ok: false, error: 'CSRF_VALIDATION_FAILED' }, { status: 403 }), requestId);
    }
    const verification = await verifyCsrfToken(headerToken);
    if (!verification.valid) {
      return securityHeaders(NextResponse.json({ ok: false, error: 'CSRF_TOKEN_EXPIRED' }, { status: 403 }), requestId);
    }
  }

  if (pathname.startsWith('/admin')) {
    const authenticated = await hasValidAdminSession(request);
    if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
      if (authenticated && (pathname === '/admin/login' || pathname === '/admin/signup')) {
        return securityHeaders(NextResponse.redirect(new URL('/admin', request.url)), requestId);
      }
      return nextResponse(request, requestId);
    }
    if (!authenticated) {
      if (pathname.startsWith('/admin/api/') || request.headers.get('accept')?.includes('application/json')) {
        return securityHeaders(NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }), requestId);
      }
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('returnTo', safeReturnPath(`${pathname}${request.nextUrl.search}`, '/admin'));
      return securityHeaders(NextResponse.redirect(loginUrl), requestId);
    }
    return nextResponse(request, requestId);
  }

  if (pathname.startsWith('/counter')) {
    const authenticated = await hasValidWorkerSession(request);
    if (matchesPath(pathname, PUBLIC_COUNTER_PATHS)) {
      if (authenticated && pathname === '/counter/login') {
        return securityHeaders(NextResponse.redirect(new URL('/counter', request.url)), requestId);
      }
      return nextResponse(request, requestId);
    }
    if (!authenticated) {
      if (pathname.startsWith('/counter/api/') || request.headers.get('accept')?.includes('application/json')) {
        return securityHeaders(NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }), requestId);
      }
      const loginUrl = new URL('/counter/login', request.url);
      loginUrl.searchParams.set('returnTo', safeReturnPath(`${pathname}${request.nextUrl.search}`, '/counter'));
      return securityHeaders(NextResponse.redirect(loginUrl), requestId);
    }
    return nextResponse(request, requestId);
  }

  if (matchesPath(pathname, PUBLIC_AUTH_PATHS) || matchesPath(pathname, PROTECTED_CUSTOMER_PATHS)) {
    const authenticated = await hasValidCustomerSession(request);
    if (matchesPath(pathname, PUBLIC_AUTH_PATHS) && authenticated) {
      return securityHeaders(NextResponse.redirect(new URL('/customer', request.url)), requestId);
    }
    if (matchesPath(pathname, PROTECTED_CUSTOMER_PATHS) && !authenticated) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('returnTo', safeReturnPath(`${pathname}${request.nextUrl.search}`, '/customer'));
      return securityHeaders(NextResponse.redirect(loginUrl), requestId);
    }
    return nextResponse(request, requestId);
  }

  return nextResponse(request, requestId);
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/counter/:path*', '/auth/:path*', '/customer/:path*', '/profile', '/orders', '/checkout', '/addresses'],
};
