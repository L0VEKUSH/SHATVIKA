import { NextResponse } from 'next/server';
import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024;
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeFilename(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

export async function POST(req: Request) {
  // Minimal local dev uploader.
  // Production requires persistent storage (S3/Cloudinary/Vercel Blob).

  const form = await req.formData();
  const file = form.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'NO_FILE' }, { status: 400 });
  }

  if (!allowed.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'INVALID_TYPE' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'FILE_TOO_LARGE' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Save into /public/uploads
  // NOTE: Next route handlers can write to disk in dev.
  // Next in serverless platforms will not persist.
  const path = `uploads/${Date.now()}-${safeFilename(file.name)}`;

  const fs = require('fs');
  const p = require('path');

  const publicDir = p.join(process.cwd(), 'public');
  const uploadDir = p.join(publicDir, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(p.join(uploadDir, path.split('/')[1]), bytes);

  return NextResponse.json({ ok: true, imageUrl: `/${path}` });
}

