import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAdminPermission } from '@/lib/adminPermissions';
import { getAdminSessionState } from '@/lib/adminJwt';
import { connectToMongo } from '@/lib/mongoose';
import { Expense } from '@/models/Expense';

const voidSchema = z.object({ reason: z.string().trim().min(3).max(300), expectedVersion: z.number().int().nonnegative() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSessionState();
  if (admin.status !== 'valid') return NextResponse.json({ ok: false, error: admin.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' }, { status: admin.status === 'database_unavailable' ? 503 : 401 });
  if (!hasAdminPermission(admin.permissions, 'finance:write')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ ok: false, error: 'INVALID_EXPENSE_ID' }, { status: 400 });
  const parsed = voidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  await connectToMongo();
  const expense = await Expense.findOneAndUpdate(
    { _id: id, status: 'active', stateVersion: parsed.data.expectedVersion },
    { $set: { status: 'voided', voidedAt: new Date(), voidedById: admin.accountId, voidReason: parsed.data.reason }, $inc: { stateVersion: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!expense) {
    const current = await Expense.findById(id).select('status stateVersion').lean();
    return NextResponse.json({ ok: false, error: current ? 'STALE_EXPENSE_VERSION' : 'EXPENSE_NOT_FOUND', details: current ?? undefined }, { status: current ? 409 : 404 });
  }
  return NextResponse.json({ ok: true, expense: expense.toJSON() });
}
