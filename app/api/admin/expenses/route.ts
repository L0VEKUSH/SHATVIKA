import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { distributedRateLimit } from '@/lib/rateLimit';
import { Expense, OPERATING_EXPENSE_CATEGORIES } from '@/models/Expense';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  incurredAt: z.string().datetime({ offset: true }),
  category: z.enum(OPERATING_EXPENSE_CATEGORIES),
  amountPaise: z.number().int().positive().max(1_000_000_000),
  note: z.string().trim().min(3).max(500),
}).strict();

async function financeAdmin(permission: string) {
  const state = await getAdminSessionState();
  if (state.status !== 'valid') return { response: NextResponse.json({ ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: state.status === 'database_unavailable' ? 503 : 401 }) };
  if (!hasAdminPermission(state.permissions, permission)) return { response: NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 }) };
  return { state };
}

export async function GET(request: NextRequest) {
  const auth = await financeAdmin('finance:read');
  if ('response' in auth) return auth.response;
  const from = new Date(request.nextUrl.searchParams.get('from') || new Date(Date.now() - 90 * 86_400_000).toISOString());
  const to = new Date(request.nextUrl.searchParams.get('to') || new Date().toISOString());
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 86_400_000) {
    return NextResponse.json({ ok: false, error: 'INVALID_RANGE' }, { status: 400 });
  }
  await connectToMongo();
  const expenses = await Expense.find({ incurredAt: { $gte: from, $lt: to } }).sort({ incurredAt: -1, _id: -1 }).limit(5_000).lean();
  return NextResponse.json({ ok: true, expenses: expenses.map(expense => ({ ...expense, id: String(expense._id), _id: undefined })) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await financeAdmin('finance:write');
  if ('response' in auth) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  const incurredAt = new Date(parsed.data.incurredAt);
  if (incurredAt > new Date(Date.now() + 86_400_000)) return NextResponse.json({ ok: false, error: 'FUTURE_EXPENSE_DATE' }, { status: 400 });
  try {
    const limited = await distributedRateLimit(`admin-expense:${auth.state.accountId}`, 40, 60);
    if (!limited.allowed) return NextResponse.json({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfter: limited.retryAfter }, { status: 429 });
    await connectToMongo();
    const expense = await Expense.create({ ...parsed.data, incurredAt, recordedById: auth.state.accountId });
    return NextResponse.json({ ok: true, expense: expense.toJSON() }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'EXPENSE_CREATE_FAILED' }, { status: 500 });
  }
}
