import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';
import { resolveInventoryMode } from '@/lib/inventory';
import { operationalReasonSchema, validationErrorResponse } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wastage'), menuItemId: z.string().trim().min(1).max(64), variantId: z.string().trim().max(120).default('base'),
    quantity: z.number().int().positive().max(1_000_000), reason: operationalReasonSchema,
  }).strict(),
  z.object({
    type: z.literal('adjustment'), menuItemId: z.string().trim().min(1).max(64), variantId: z.string().trim().max(120).default('base'),
    quantityDelta: z.number().int().min(-1_000_000).max(1_000_000).refine(value => value !== 0), reason: operationalReasonSchema,
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
  if (!parsed.success) return validationErrorResponse(parsed.error, 'Check the inventory change and provide a reason between 3 and 300 characters.');
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
        const existing = await MenuItem.findById(parsed.data.menuItemId)
          .select('inventoryMode quantity')
          .session(session)
          .lean();
        if (!existing) throw new Error('ITEM_NOT_FOUND');
        const inventoryMode = resolveInventoryMode(existing);
        if (inventoryMode === 'unconfigured') throw new Error('INVENTORY_NOT_CONFIGURED');
        if (inventoryMode === 'unlimited') throw new Error('INVENTORY_NOT_TRACKED');
        const product = await MenuItem.findOneAndUpdate(
          { _id: parsed.data.menuItemId, ...(quantityDelta < 0 ? { quantity: { $gte: quantity } } : {}) },
          { $inc: { quantity: quantityDelta, ...(parsed.data.type === 'wastage' ? { quantityWasted: quantity } : {}) } },
          { returnDocument: 'after', runValidators: true, session },
        );
        if (!product) throw new Error('INSUFFICIENT_STOCK');
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
    if (error instanceof Error && ['ITEM_NOT_FOUND', 'INVENTORY_NOT_CONFIGURED', 'INVENTORY_NOT_TRACKED', 'INSUFFICIENT_STOCK'].includes(error.message)) {
      const status = error.message === 'ITEM_NOT_FOUND' ? 404 : 409;
      const messages: Record<string, string> = {
        ITEM_NOT_FOUND: 'The menu item no longer exists.',
        INVENTORY_NOT_CONFIGURED: 'Choose tracked or unlimited inventory before recording stock changes.',
        INVENTORY_NOT_TRACKED: 'Stock adjustments are not applicable to an unlimited item.',
        INSUFFICIENT_STOCK: 'This change would make stock negative.',
      };
      return NextResponse.json({ ok: false, error: error.message, message: messages[error.message] }, { status });
    }
    return NextResponse.json({ ok: false, error: 'INVENTORY_EVENT_FAILED' }, { status: 500 });
  }
}
