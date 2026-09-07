import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const ALLOWED_TYPES = new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);
const ALLOWED_EXTENSIONS = new Set([...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]);

/**
 * Sanitize filename to prevent directory traversal and malicious names
 */
function sanitizeFilename(name: string): string {
  // Remove any path separators and parent directory references
  let sanitized = name
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase()
    .slice(0, 80);

  // Ensure filename is not empty
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'upload';
  }

  return sanitized;
}

/**
 * Validate file extension matches MIME type
 */
function validateFileExtension(filename: string, mimeType: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return false;
  }

  // Verify extension matches MIME type
  const mimeToExt: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'video/mp4': ['mp4'],
    'video/webm': ['webm'],
  };

  const validExts = mimeToExt[mimeType] || [];
  return validExts.includes(ext);
}

/**
 * Validate image file magic bytes (prevent MIME type spoofing)
 */
function validateFileMagic(bytes: Buffer, mimeType: string): boolean {
  if (ALLOWED_VIDEO_TYPES.has(mimeType)) {
    if (mimeType === 'video/webm') {
      return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    }
    // MP4: ftyp box typically at offset 4
    return bytes.length > 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }

  // Check magic bytes for common image formats
  if (mimeType === 'image/jpeg') {
    // JPEG: FF D8 FF
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    // PNG: 89 50 4E 47
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    // WebP: RIFF ... WEBP
    return (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }
  return false;
}

export async function POST(req: Request) {
  try {
    // Rate limiting: 10 uploads per minute per IP
    const ip = getClientIp(req);
    const rateLimitResult = rateLimit(`upload:${ip}`, 10, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Parse form data
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'INVALID_FORM_DATA' },
        { status: 400 }
      );
    }

    const file = form.get('file');

    // Validate file exists and is a File object
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'NO_FILE' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_TYPE' },
        { status: 400 }
      );
    }

    const maxBytes = ALLOWED_VIDEO_TYPES.has(file.type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }

    // Validate file extension
    if (!validateFileExtension(file.name, file.type)) {
      return NextResponse.json(
        { ok: false, error: 'EXTENSION_MISMATCH' },
        { status: 400 }
      );
    }

    // Read file bytes and validate magic bytes
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!validateFileMagic(bytes, file.type)) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_FILE_CONTENT' },
        { status: 400 }
      );
    }

    // Sanitize filename
    const sanitized = sanitizeFilename(file.name);
    const filename = `${Date.now()}-${sanitized}`;

    // Save file
    const fs = require('fs');
    const p = require('path');

    const publicDir = p.join(process.cwd(), 'public');
    const uploadDir = p.join(publicDir, 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = p.join(uploadDir, filename);
    fs.writeFileSync(filePath, bytes);

    const mediaType = ALLOWED_VIDEO_TYPES.has(file.type) ? 'video' : 'image';
    return NextResponse.json(
      { ok: true, imageUrl: `/uploads/${filename}`, mediaType },
      { status: 201 }
    );
  } catch (err) {
    console.error('[Upload] error:', err);
    return NextResponse.json(
      { ok: false, error: 'UPLOAD_FAILED' },
      { status: 500 }
    );
  }
}

