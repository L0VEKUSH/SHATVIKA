import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { User } from '@/models/User';
import { verifyCustomerToken } from '@/lib/customerJwt';

function getTokenFromCookies(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)customer_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertCustomerAuth(req: NextRequest) {
  const token = getTokenFromCookies(req.headers.get('cookie'));
  if (!token) throw new Error('UNAUTHENTICATED');
  
  const isValid = await verifyCustomerToken(token);
  if (!isValid) throw new Error('UNAUTHORIZED');
  
  return token;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertCustomerAuth(req);
    await connectToMongo();

    // Clear user's cart (id param not really used here)
    // In a real app, you'd fetch the user and update their cart field

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[DELETE /api/user/cart/[id]]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
