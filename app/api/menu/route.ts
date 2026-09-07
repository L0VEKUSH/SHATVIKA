import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { MenuItem } from '@/models/MenuItem';
import { isAdminJwtAuthed } from '@/lib/adminJwt';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Rate limiting: 30 requests per minute per IP (generous for menu fetches)
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp, 30, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  try {
    await connectToMongo();
    const items = await MenuItem.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(items);
  } catch (err) {
    console.error('[GET /api/menu]', err);
    return NextResponse.json({ error: 'Failed to fetch menu items' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || !body.name || !Array.isArray(body.variants) || body.variants.length === 0) {
      return NextResponse.json(
        { error: 'name and at least one variant are required' },
        { status: 400 }
      );
    }

    await connectToMongo();
    const newItem = await MenuItem.create(body);
    return NextResponse.json(newItem, { status: 201 });
  } catch (err) {
    console.error('[POST /api/menu]', err);
    return NextResponse.json({ error: 'Failed to create menu item' }, { status: 500 });
  }
}
