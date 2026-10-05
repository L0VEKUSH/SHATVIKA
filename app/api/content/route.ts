import mongoose, { type Model } from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionState } from '@/lib/adminJwt';
import { logServerError } from '@/lib/apiError';
import { connectToMongo } from '@/lib/mongoose';
import { Feature, GalleryItem, Stat, TeamMember } from '@/models/Content';

export const dynamic = 'force-dynamic';

const safeMediaUrl = z.string().trim().min(1).max(2048).refine((value) => {
  if (value.startsWith('/uploads/')) return true; // Read-only compatibility for legacy assets.
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:');
  } catch {
    return false;
  }
}, 'Use an HTTPS media URL');

const schemas = {
  feature: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    emoji: z.string().trim().min(1).max(20),
    gradient: z.string().trim().min(1).max(200),
  }).strict(),
  stat: z.object({
    value: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(100),
    emoji: z.string().trim().min(1).max(20),
  }).strict(),
  teammember: z.object({
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    emoji: z.string().trim().min(1).max(20),
    gradient: z.string().trim().min(1).max(200),
  }).strict(),
  galleryitem: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    category: z.enum(['Food', 'Restaurant', 'Team', 'Events']),
    imageUrl: safeMediaUrl,
    imageType: z.enum(['image', 'video', 'youtube']),
    youtubeId: z.string().trim().max(80).optional(),
    featured: z.boolean().optional(),
    order: z.number().int().min(0).max(1_000_000).optional(),
    label: z.string().trim().max(120).optional(),
    emoji: z.string().trim().max(20).optional(),
    gradient: z.string().trim().max(200).optional(),
    tall: z.boolean().optional(),
  }).strict(),
} as const;

type ContentType = keyof typeof schemas;

const models: Record<ContentType, Model<any>> = {
  feature: Feature,
  stat: Stat,
  teammember: TeamMember,
  galleryitem: GalleryItem,
};

function contentType(value: string | null): ContentType | null {
  const normalized = value?.toLowerCase() as ContentType | undefined;
  return normalized && normalized in schemas ? normalized : null;
}

function serialize(value: any) {
  const raw = typeof value?.toJSON === 'function' ? value.toJSON() : value;
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id),
    _id: undefined,
    __v: undefined,
  };
}

async function requireAdmin() {
  const state = await getAdminSessionState();
  if (state.status === 'valid') return state;
  return NextResponse.json(
    { ok: false, error: state.status === 'database_unavailable' ? 'DATABASE_UNAVAILABLE' : 'UNAUTHORIZED' },
    { status: state.status === 'database_unavailable' ? 503 : 401 },
  );
}

function invalidType() {
  return NextResponse.json(
    { ok: false, error: 'INVALID_CONTENT_TYPE', details: { allowed: Object.keys(schemas) } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  const type = contentType(request.nextUrl.searchParams.get('type'));
  if (!type) return invalidType();
  try {
    await connectToMongo();
    const values = await models[type].find().sort({ createdAt: -1, _id: -1 }).limit(200).lean();
    return NextResponse.json(values.map(serialize), {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    logServerError({ route: 'GET /api/content', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'CONTENT_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const type = contentType(request.nextUrl.searchParams.get('type'));
  if (!type) return invalidType();
  const parsed = schemas[type].safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const created = await models[type].create(parsed.data);
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (error) {
    logServerError({ route: 'POST /api/content', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'CONTENT_CREATE_FAILED' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const type = contentType(request.nextUrl.searchParams.get('type'));
  if (!type) return invalidType();
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  }
  const selectedSchema = schemas[type] as z.ZodObject<Record<string, z.ZodTypeAny>>;
  const patchSchema = selectedSchema.partial().refine(
    (value: Record<string, unknown>) => Object.keys(value).length > 0,
    'At least one field is required',
  );
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'VALIDATION_FAILED', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const updated = await models[type].findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) return NextResponse.json({ ok: false, error: 'CONTENT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json(serialize(updated));
  } catch (error) {
    logServerError({ route: 'PUT /api/content', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'CONTENT_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const type = contentType(request.nextUrl.searchParams.get('type'));
  if (!type) return invalidType();
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  }
  try {
    const deleted = await models[type].findByIdAndDelete(id).select('_id').lean();
    if (!deleted) return NextResponse.json({ ok: false, error: 'CONTENT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    logServerError({ route: 'DELETE /api/content', err: error, requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, error: 'CONTENT_DELETE_FAILED' }, { status: 500 });
  }
}
