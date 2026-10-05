import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit, getClientIp } from '@/lib/rateLimit';
import { MenuItem } from '@/models/MenuItem';
import { INVENTORY_MODES } from '@/lib/inventory';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'Momos', 'Fries', 'Burgers', 'Patties', 'Sandwiches', 'South Indian',
  'Shakes', 'Drinks', 'Desserts', 'Pizza',
] as const;

const variantSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(60),
  price: z.number().nonnegative().max(1_000_000),
  costPaise: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  available: z.boolean().optional(),
}).strict();

const menuItemInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  ingredients: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  images: z.array(z.string().trim().min(1).max(2048)).max(10).optional(),
  variants: z.array(variantSchema).max(30).optional(),
  basePrice: z.number().nonnegative().max(1_000_000).nullable().optional(),
  costPaise: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  category: z.enum(CATEGORIES),
  emoji: z.string().trim().min(1).max(20),
  gradientClass: z.string().trim().min(1).max(200),
  popular: z.boolean().optional(),
  spicy: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  available: z.boolean().optional(),
  inventoryMode: z.enum(INVENTORY_MODES).default('tracked'),
  isNew: z.boolean().optional(),
  isNewItem: z.boolean().optional(),
  quantity: z.number().int().nonnegative().max(1_000_000).optional(),
  reorderPoint: z.number().int().nonnegative().max(1_000_000).optional(),
}).strict().superRefine((value, context) => {
  const hasVariants = Boolean(value.variants?.length);
  const hasBase = value.basePrice !== undefined && value.basePrice !== null;
  if (!hasVariants && !hasBase) {
    context.addIssue({ code: 'custom', path: ['basePrice'], message: 'Provide basePrice or at least one variant' });
  }
  if (hasVariants && hasBase) {
    context.addIssue({ code: 'custom', path: ['variants'], message: 'Use variants or basePrice, not both' });
  }
});

export async function GET(request: NextRequest) {
  try {
    const limited = await distributedRateLimit(`menu-read:${getClientIp(request)}`, 60, 60);
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryAfter: limited.retryAfter }, {
        status: 429,
        headers: { 'Retry-After': String(limited.retryAfter ?? 60) },
      });
    }
    await connectToMongo();
    const adminRequested = request.nextUrl.searchParams.get('scope') === 'admin';
    let admin = false;
    if (adminRequested) admin = (await getAdminSessionState()).status === 'valid';
    if (adminRequested && !admin) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const filter = admin ? {} : { archivedAt: null };
    const query = MenuItem.find(filter).sort({ createdAt: -1 });
    if (!admin) query.select('-costPaise -variants.costPaise');
    const items = await query.lean();
    const requireFreshInventory = request.nextUrl.searchParams.get('availability') === '1';
    return NextResponse.json(items, { headers: { 'Cache-Control': admin || requireFreshInventory ? 'private, no-store' : 'public, max-age=30' } });
  } catch (error) {
    logServerError({ route: 'GET /api/menu', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'MENU_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSessionState();
  if (admin.status !== 'valid') {
    return NextResponse.json({ ok: false, error: admin.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: admin.status === 'database_unavailable' ? 503 : 401 });
  }
  const parsed = menuItemInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { isNew, ...data } = parsed.data;
    const created = await MenuItem.create({ ...data, isNewItem: data.isNewItem ?? isNew ?? false });
    return NextResponse.json({ ok: true, item: created.toJSON() }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'MENU_NAME_EXISTS' }, { status: 409 });
    }
    logServerError({ route: 'POST /api/menu', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'MENU_CREATE_FAILED' }, { status: 500 });
  }
}
