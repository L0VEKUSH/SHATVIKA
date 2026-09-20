import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { CostRecord } from '@/models/CostRecord';
import { MenuItem } from '@/models/MenuItem';

export const dynamic = 'force-dynamic';

const costSchema = z.object({
  menuItemId: z.string().trim().min(1).max(64),
  variantId: z.string().trim().min(1).max(120).default('base'),
  ingredientPaise: z.number().int().nonnegative().max(100_000_000).default(0),
  productPaise: z.number().int().nonnegative().max(100_000_000).default(0),
  packagingPaise: z.number().int().nonnegative().max(100_000_000).default(0),
  note: z.string().trim().min(3).max(500),
}).strict().superRefine((value, context) => {
  if (value.ingredientPaise > 0 && value.productPaise > 0) {
    context.addIssue({ code: 'custom', path: ['productPaise'], message: 'Use ingredient cost for prepared items or product cost for purchased items, not both' });
  }
  if (value.ingredientPaise + value.productPaise + value.packagingPaise <= 0) {
    context.addIssue({ code: 'custom', path: ['ingredientPaise'], message: 'Total unit cost must be greater than zero' });
  }
});

async function authorize(permission: string) {
  const state = await getAdminSessionState();
  if (state.status !== 'valid') return { response: NextResponse.json({ ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: state.status === 'database_unavailable' ? 503 : 401 }) };
  if (!hasAdminPermission(state.permissions, permission)) return { response: NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 }) };
  return { state };
}

export async function GET(request: NextRequest) {
  const auth = await authorize('finance:read');
  if ('response' in auth) return auth.response;
  await connectToMongo();
  const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? 50) || 50));
  const records = await CostRecord.find().sort({ effectiveAt: -1, _id: -1 }).limit(limit).lean();
  return NextResponse.json({ ok: true, records: records.map(record => ({ ...record, id: String(record._id), menuItemId: String(record.menuItemId), _id: undefined })) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await authorize('finance:write');
  if ('response' in auth) return auth.response;
  const parsed = costSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  if (!mongoose.isValidObjectId(parsed.data.menuItemId)) return NextResponse.json({ ok: false, error: 'INVALID_MENU_ITEM_ID' }, { status: 400 });
  try {
    const limited = await distributedRateLimit(`admin-cost:${auth.state.accountId}`, 40, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, { status: 429 });
    await connectToMongo();
    const session = await mongoose.startSession();
    let response: Record<string, unknown> | null = null;
    try {
      await session.withTransaction(async () => {
        const item = await MenuItem.findById(parsed.data.menuItemId).session(session);
        if (!item) throw new Error('MENU_ITEM_NOT_FOUND');
        const totalCostPaise = parsed.data.ingredientPaise + parsed.data.productPaise + parsed.data.packagingPaise;
        const breakdown = {
          ingredientPaise: parsed.data.ingredientPaise,
          productPaise: parsed.data.productPaise,
          packagingPaise: parsed.data.packagingPaise,
        };
        if (parsed.data.variantId === 'base') {
          if (item.variants?.length) throw new Error('VARIANT_REQUIRED');
          item.costPaise = totalCostPaise;
          item.costBreakdown = breakdown;
        } else {
          const variant = item.variants?.find((candidate: any) => candidate.id === parsed.data.variantId);
          if (!variant) throw new Error('VARIANT_NOT_FOUND');
          variant.costPaise = totalCostPaise;
          variant.costBreakdown = breakdown;
        }
        await item.save({ session });
        const [record] = await CostRecord.create([{
          menuItemId: item._id,
          variantId: parsed.data.variantId,
          ...breakdown,
          totalCostPaise,
          effectiveAt: new Date(),
          note: parsed.data.note,
          recordedById: auth.state.accountId,
        }], { session });
        response = { id: String(record._id), menuItemId: String(item._id), variantId: parsed.data.variantId, totalCostPaise, ...breakdown, effectiveAt: record.effectiveAt, note: record.note };
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true, record: response }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['MENU_ITEM_NOT_FOUND', 'VARIANT_NOT_FOUND', 'VARIANT_REQUIRED'].includes(code)) return NextResponse.json({ ok: false, error: code }, { status: 404 });
    return NextResponse.json({ ok: false, error: 'COST_RECORD_FAILED' }, { status: 500 });
  }
}
