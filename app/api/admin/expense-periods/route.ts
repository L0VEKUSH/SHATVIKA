import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { getFulfillmentCapabilities } from '@/lib/businessRules';
import { connectToMongo } from '@/lib/mongoose';
import { ExpensePeriod } from '@/models/ExpensePeriod';

const schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  complete: z.boolean(),
  note: z.string().trim().max(500).optional(),
}).strict();

async function admin(permission: string) {
  const state = await getAdminSessionState();
  if (state.status !== 'valid') return { response: NextResponse.json({ ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: state.status === 'database_unavailable' ? 503 : 401 }) };
  if (!hasAdminPermission(state.permissions, permission)) return { response: NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 }) };
  return { state };
}

export async function GET() {
  const auth = await admin('finance:read');
  if ('response' in auth) return auth.response;
  await connectToMongo();
  const periods = await ExpensePeriod.find({ locationId: getFulfillmentCapabilities().locationId }).sort({ month: -1 }).limit(24).lean();
  return NextResponse.json({ ok: true, periods: periods.map(period => ({ ...period, id: String(period._id), _id: undefined })) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await admin('finance:write');
  if ('response' in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  await connectToMongo();
  const locationId = getFulfillmentCapabilities().locationId;
  const period = await ExpensePeriod.findOneAndUpdate(
    { locationId, month: parsed.data.month },
    { $set: { complete: parsed.data.complete, note: parsed.data.note || null, updatedById: auth.state.accountId, completedAt: parsed.data.complete ? new Date() : null } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  );
  return NextResponse.json({ ok: true, period });
}
