import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wastage'), menuItemId: z.string().trim().min(1).max(64), variantId: z.string().trim().max(120).default('base'),
    quantity: z.number().int().positive().max(1_000_000), reason: z.string().trim().min(3).max(300),
  }).strict(),
  z.object({
    type: z.literal('adjustment'), menuItemId: z.string().trim().min(1).max(64), variantId: z.string().trim().max(120).default('base'),
    quantityDelta: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0), reason: z.string().trim().min(3).max(300),
  }).strict(),
]);

async function inventoryAdmin(permission: string) {
  const state = await getAdminSessionState();
  if (state.status !== 'valid') return { response: NextResponse.json({ ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: state.status === 'database_unavailable' ? 503 : 401 }) };
  if (!hasAdminPermission(state.permissions, permission)) return { response: NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 }) };
  return { state };
}

export async function GET(request: NextRequest) {
  const auth = await inventoryAdmin('inventory:read');
  if ('response' in auth) return auth.response;
  const from = new Date(request.nextUrl.searchParams.get('from') || new Date(Date.now() - 30 * 86_400_000).toISOString());
  const to = new Date(request.nextUrl.searchParams.get('to') || new Date().toISOString());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 86_400_000) {
    return NextResponse.json({ ok: false, error: 'INVALID_RANGE' }, { status: 400 });
  }
  await connectToMongo();
  const events = await InventoryEvent.find({ occurredAt: { $gte: from, $lt: to } }).sort({ occurredAt: -1, _id: -1 }).limit(5_000).lean();
  const ids = [...new Set(events.map(event => String(event.menuItemId)))].filter(mongoose.isValidObjectId);
  const products = ids.length ? await MenuItem.find({ _id: { $in: ids } }).select('name category').lean() : [];
  const names = new Map(products.map(product => [String(product._id), { name: product.name, category: product.category }]));
  return NextResponse.json({
    ok: true,
    events: events.map(event => ({
      ...event, id: String(event._id), _id: undefined, menuItemId: String(event.menuItemId), orderId: event.orderId ? String(event.orderId) : null,
      productName: names.get(String(event.menuItemId))?.name ?? 'Unknown or archived item',
      categoryName: names.get(String(event.menuItemId))?.category ?? 'Unknown',
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await inventoryAdmin('inventory:write');
  if ('response' in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  if (!mongoose.isValidObjectId(parsed.data.menuItemId)) return NextResponse.json({ ok: false, error: 'INVALID_MENU_ITEM_ID' }, { status: 400 });
  try {
    const limited = await distributedRateLimit(`admin-inventory:${auth.state.accountId}`, 60, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, { status: 429 });
    await connectToMongo();
    const quantityDelta = parsed.data.type === 'wastage' ? -parsed.data.quantity : parsed.data.quantityDelta;
    const quantity = Math.abs(quantityDelta);
    const session = await mongoose.startSession();
    const resultHolder: { value: { event: unknown; currentQuantity: number } | null } = { value: null };
    try {
      await session.withTransaction(async () => {
        const product = await MenuItem.findOneAndUpdate(
          { _id: parsed.data.menuItemId, ...(quantityDelta < 0 ? { quantity: { $gte: quantity } } : {}) },
          { $inc: { quantity: quantityDelta, ...(parsed.data.type === 'wastage' ? { quantityWasted: quantity } : {}) } },
          { returnDocument: 'after', runValidators: true, session },
        );
        if (!product) throw new Error('ITEM_NOT_FOUND_OR_INSUFFICIENT_STOCK');
        const [event] = await InventoryEvent.create([{
          menuItemId: product._id, variantId: parsed.data.variantId, type: parsed.data.type, quantity, quantityDelta,
          reason: parsed.data.reason, actorType: 'admin', actorId: auth.state.accountId, occurredAt: new Date(),
        }], { session });
        resultHolder.value = { event, currentQuantity: product.quantity };
      });
    } finally {
      await session.endSession();
    }
    if (!resultHolder.value) return NextResponse.json({ ok: false, error: 'INVENTORY_EVENT_FAILED' }, { status: 500 });
    return NextResponse.json({ ok: true, event: resultHolder.value.event, currentQuantity: resultHolder.value.currentQuantity }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'ITEM_NOT_FOUND_OR_INSUFFICIENT_STOCK') {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'INVENTORY_EVENT_FAILED' }, { status: 500 });
  }
}
