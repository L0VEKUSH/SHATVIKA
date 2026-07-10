import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/adminJwtEdge';

const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/api/login'];

function isPublicAdminPath(pathname: string) {
  return PUBLIC_ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

async function hasValidAdminSession(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value;
  if (!token) return false;
  return verifyAdminToken(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

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

export const config = {
  matcher: ['/admin/:path*'],
};
