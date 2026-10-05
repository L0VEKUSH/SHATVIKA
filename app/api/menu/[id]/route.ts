import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { MenuItem } from '@/models/MenuItem';
import { INVENTORY_MODES } from '@/lib/inventory';
import { AuditEvent } from '@/models/AuditEvent';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'Momos', 'Fries', 'Burgers', 'Patties', 'Sandwiches', 'South Indian',
  'Shakes', 'Drinks', 'Desserts', 'Pizza',
] as const;
const variant = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(60),
  price: z.number().nonnegative().max(1_000_000),
  costPaise: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  available: z.boolean().optional(),
}).strict();
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  ingredients: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  images: z.array(z.string().trim().min(1).max(2048)).max(10).optional(),
  variants: z.array(variant).max(30).optional(),
  basePrice: z.number().nonnegative().max(1_000_000).nullable().optional(),
  costPaise: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
  emoji: z.string().trim().min(1).max(20).optional(),
  gradientClass: z.string().trim().min(1).max(200).optional(),
  popular: z.boolean().optional(),
  spicy: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  available: z.boolean().optional(),
  inventoryMode: z.enum(INVENTORY_MODES).optional(),
  isNew: z.boolean().optional(),
  isNewItem: z.boolean().optional(),
  quantity: z.number().int().nonnegative().max(1_000_000).optional(),
  reorderPoint: z.number().int().nonnegative().max(1_000_000).optional(),
}).strict();

async function adminSession() {
  const state = await getAdminSessionState();
  if (state.status !== 'valid') {
    return NextResponse.json(
      { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' },
      { status: state.status === 'database_unavailable' ? 503 : 401 },
    );
  }
  return state;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
    await connectToMongo();
    const adminRequested = request.nextUrl.searchParams.get('scope') === 'admin';
    if (adminRequested && (await getAdminSessionState()).status !== 'valid') {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const query = MenuItem.findOne({ _id: id, ...(adminRequested ? {} : { archivedAt: null }) });
    if (!adminRequested) query.select('-costPaise -variants.costPaise');
    const item = await query.lean();
    if (!item) return NextResponse.json({ ok: false, error: 'MENU_ITEM_NOT_FOUND' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    logServerError({ route: 'GET /api/menu/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'MENU_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await adminSession();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { isNew, ...patch } = parsed.data;
    const inventoryConfigurationChange = parsed.data.inventoryMode !== undefined ||
      parsed.data.quantity !== undefined || parsed.data.reorderPoint !== undefined;
    let savedItem: any = null;

    if (inventoryConfigurationChange) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const item = await MenuItem.findById(id).session(session);
          if (!item) throw new Error('MENU_ITEM_NOT_FOUND');
          const before = {
            inventoryMode: item.inventoryMode ?? null,
            quantity: Number.isSafeInteger(item.quantity) ? item.quantity : null,
            reorderPoint: Number.isSafeInteger(item.reorderPoint) ? item.reorderPoint : null,
          };
          item.set({ ...patch, ...(isNew === undefined ? {} : { isNewItem: isNew }) });
          const hasVariants = item.variants?.length > 0;
          const hasBase = item.basePrice !== undefined && item.basePrice !== null;
          if (hasVariants === hasBase) throw new Error('PRICE_CONTRACT_INVALID');
          await item.save({ session });
          await AuditEvent.create([{
            actorType: 'admin',
            actorId: auth.accountId,
            action: 'menu.inventory_configuration.update',
            resourceType: 'menu_item',
            resourceId: id,
            correlationId: request.headers.get('x-request-id'),
            outcome: 'success',
            metadata: {
              before,
              after: {
                inventoryMode: item.inventoryMode,
                quantity: item.quantity,
                reorderPoint: item.reorderPoint,
              },
            },
          }], { session });
          savedItem = item;
        });
      } finally {
        await session.endSession();
      }
    } else {
      const item = await MenuItem.findById(id);
      if (!item) return NextResponse.json({ ok: false, error: 'MENU_ITEM_NOT_FOUND' }, { status: 404 });
      item.set({ ...patch, ...(isNew === undefined ? {} : { isNewItem: isNew }) });
      const hasVariants = item.variants?.length > 0;
      const hasBase = item.basePrice !== undefined && item.basePrice !== null;
      if (hasVariants === hasBase) return NextResponse.json({ ok: false, error: 'PRICE_CONTRACT_INVALID' }, { status: 400 });
      await item.save();
      savedItem = item;
    }
    return NextResponse.json({ ok: true, item: savedItem.toJSON() });
  } catch (error) {
    if (error instanceof Error && error.message === 'MENU_ITEM_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: 'MENU_ITEM_NOT_FOUND' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'PRICE_CONTRACT_INVALID') {
      return NextResponse.json({ ok: false, error: 'PRICE_CONTRACT_INVALID' }, { status: 400 });
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json({ ok: false, error: 'MENU_NAME_EXISTS' }, { status: 409 });
    }
    logServerError({ route: 'PUT /api/menu/:id', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'MENU_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await adminSession();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  const archived = await MenuItem.findOneAndUpdate(
    { _id: id, archivedAt: null },
    { $set: { archivedAt: new Date(), available: false } },
    { returnDocument: 'after' },
  ).lean();
  if (!archived) return NextResponse.json({ ok: false, error: 'MENU_ITEM_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, id, archived: true });
}
