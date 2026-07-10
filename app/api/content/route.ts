import { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Feature, Stat, TeamMember, GalleryItem } from '@/models/Content';
import { isAdminJwtAuthed } from '@/lib/adminJwt';
import type { Model } from 'mongoose';

export const dynamic = 'force-dynamic';

const MODELS: Record<string, Model<any>> = {
  feature:     Feature,
  stat:        Stat,
  teammember:  TeamMember,
  galleryitem: GalleryItem,
};

function getModel(type: string | null): Model<any> | null {
  if (!type) return null;
  return MODELS[type.toLowerCase()] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const type = new URL(req.url).searchParams.get('type');
    const Model = getModel(type);
    if (!Model) {
      return NextResponse.json({ error: 'Invalid or missing type. Valid: feature, stat, teammember, galleryitem' }, { status: 400 });
    }

    await connectToMongo();
    const items = await Model.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(items);
  } catch (err) {
    console.error('[GET /api/content]', err);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const type = new URL(req.url).searchParams.get('type');
    const Model = getModel(type);
    if (!Model) {
      return NextResponse.json({ error: 'Invalid or missing type' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    await connectToMongo();
    const newItem = await Model.create(body);
    return NextResponse.json(newItem, { status: 201 });
  } catch (err) {
    console.error('[POST /api/content]', err);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const id   = url.searchParams.get('id');
    const Model = getModel(type);

    if (!Model || !id) {
      return NextResponse.json({ error: 'Valid type and id are required' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

    await connectToMongo();
    const updated = await Model.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PUT /api/content]', err);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const id   = url.searchParams.get('id');
    const Model = getModel(type);

    if (!Model || !id) {
      return NextResponse.json({ error: 'Valid type and id are required' }, { status: 400 });
    }

    await connectToMongo();
    const deleted = await Model.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/content]', err);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}
