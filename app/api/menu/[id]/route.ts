import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { MenuItem } from '@/models/MenuItem';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    await connectToMongo();
    const updated = await MenuItem.findByIdAndUpdate(id, { $set: body }, { new: true, runValidators: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PUT /api/menu/:id]', err);
    return NextResponse.json({ error: 'Failed to update menu item' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToMongo();
    const deleted = await MenuItem.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/menu/:id]', err);
    return NextResponse.json({ error: 'Failed to delete menu item' }, { status: 500 });
  }
}
