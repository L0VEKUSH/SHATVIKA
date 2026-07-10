import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/adminAuth';

function loginRedirect(request: Request) {
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export async function POST(request: Request) {
  await clearAdminSession();
  return loginRedirect(request);
}

export async function GET(request: Request) {
  await clearAdminSession();
  return loginRedirect(request);
}
