import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/adminJwtEdge';
import { verifyCustomerToken } from '@/lib/customerJwtEdge';

/**
 * CSRF Token Validation Helper
 * Validates CSRF tokens for POST/PUT/DELETE requests
 */
function validateCSRFToken(request: NextRequest): boolean {
  // Get token from header
  const headerToken = request.headers.get('x-csrf-token');
  // Get token from cookie
  const cookieToken = request.cookies.get('X-CSRF-Token')?.value;

  // Both tokens must exist and match
  if (!headerToken || !cookieToken) {
    return false;
  }

  return headerToken === cookieToken;
}

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/api/login', '/admin/signup', '/admin/api/signup'];
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup'];
const PROTECTED_CUSTOMER_PATHS = ['/customer', '/profile', '/orders', '/checkout', '/addresses'];

function isPublicAdminPath(pathname: string) {
  return PUBLIC_ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function isPublicAuthPath(pathname: string) {
  return PUBLIC_AUTH_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function isProtectedCustomerPath(pathname: string) {
  return PROTECTED_CUSTOMER_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

async function hasValidAdminSession(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value;
  if (!token) return false;
  return verifyAdminToken(token);
}

async function hasValidCustomerSession(request: NextRequest) {
  const token = request.cookies.get('customer_session')?.value;
  if (!token) return false;
  return verifyCustomerToken(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestMethod = request.method.toUpperCase();

  // CSRF Protection: Validate state-changing requests on protected routes
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (stateChangingMethods.includes(requestMethod)) {
    // Check CSRF on admin API routes
    if (pathname.startsWith('/api/admin') || pathname.startsWith('/admin/api')) {
      if (!validateCSRFToken(request)) {
        return NextResponse.json(
          { ok: false, error: 'CSRF_VALIDATION_FAILED' },
          { status: 403 }
        );
      }
    }

    // Check CSRF on protected customer API routes
    if (pathname.startsWith('/api/customer') || pathname.startsWith('/api/orders') || pathname.startsWith('/api/user')) {
      if (!validateCSRFToken(request)) {
        return NextResponse.json(
          { ok: false, error: 'CSRF_VALIDATION_FAILED' },
          { status: 403 }
        );
      }
    }
  }

  // Admin routes
  if (pathname.startsWith('/admin')) {
    const authed = await hasValidAdminSession(request);

    if (isPublicAdminPath(pathname)) {
      if (authed && pathname.startsWith('/admin/login')) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }

    if (!authed) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // Customer auth & protected routes
  if (isPublicAuthPath(pathname) || isProtectedCustomerPath(pathname)) {
    const authed = await hasValidCustomerSession(request);

    // If on auth pages and already authenticated, redirect to customer dashboard
    if (isPublicAuthPath(pathname) && authed) {
      return NextResponse.redirect(new URL('/customer/dashboard', request.url));
    }

    // If on protected routes and not authenticated, redirect to login
    if (isProtectedCustomerPath(pathname) && !authed) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/auth/:path*', '/customer/:path*', '/profile', '/orders', '/checkout', '/addresses'],
};
