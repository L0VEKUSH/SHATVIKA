export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ADMIN_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ADMIN_VIDEO_BYTES = 50 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

export type SupportedMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm';

export type MediaKind = 'image' | 'video';

const TYPE_EXTENSIONS: Readonly<Record<SupportedMediaType, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
};

const SUPPORTED_TYPES = new Set<SupportedMediaType>(
  Object.keys(TYPE_EXTENSIONS) as SupportedMediaType[],
);

export function isSupportedMediaType(value: string): value is SupportedMediaType {
  return SUPPORTED_TYPES.has(value as SupportedMediaType);
}

export function mediaKindForType(mimeType: SupportedMediaType): MediaKind {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

export function fileExtensionMatches(filename: string, mimeType: SupportedMediaType): boolean {
  const basename = filename.split(/[\\/]/).pop() ?? '';
  const extension = basename.includes('.') ? basename.split('.').pop()?.toLowerCase() : undefined;
  return Boolean(extension && TYPE_EXTENSIONS[mimeType].includes(extension));
}

/**
 * Verify the container signature instead of trusting the multipart MIME label.
 * The object provider performs the full media decode/transcode after this gate.
 */
export function fileMagicMatches(bytes: Uint8Array, mimeType: SupportedMediaType): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (mimeType === 'video/mp4') {
    return bytes.length >= 12 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }
  return bytes.length >= 4 &&
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function maximumBytesFor(mimeType: SupportedMediaType, scope: 'review' | 'admin-gallery'): number {
  if (scope === 'review') return MAX_REVIEW_IMAGE_BYTES;
  return mediaKindForType(mimeType) === 'video' ? MAX_ADMIN_VIDEO_BYTES : MAX_ADMIN_IMAGE_BYTES;
}

export type MediaValidationFailure =
  | 'EMPTY_FILE'
  | 'INVALID_TYPE'
  | 'VIDEOS_NOT_ALLOWED'
  | 'FILE_TOO_LARGE'
  | 'EXTENSION_MISMATCH'
  | 'INVALID_FILE_CONTENT';

export function validateMediaFile(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  scope: 'review' | 'admin-gallery';
}): { ok: true; mimeType: SupportedMediaType; mediaType: MediaKind } | { ok: false; error: MediaValidationFailure } {
  if (input.bytes.byteLength === 0) return { ok: false, error: 'EMPTY_FILE' };
  if (!isSupportedMediaType(input.mimeType)) return { ok: false, error: 'INVALID_TYPE' };
  const mediaType = mediaKindForType(input.mimeType);
  if (input.scope === 'review' && mediaType !== 'image') return { ok: false, error: 'VIDEOS_NOT_ALLOWED' };
  if (input.bytes.byteLength > maximumBytesFor(input.mimeType, input.scope)) {
    return { ok: false, error: 'FILE_TOO_LARGE' };
  }
  if (!fileExtensionMatches(input.filename, input.mimeType)) {
    return { ok: false, error: 'EXTENSION_MISMATCH' };
  }
  if (!fileMagicMatches(input.bytes, input.mimeType)) {
    return { ok: false, error: 'INVALID_FILE_CONTENT' };
  }
  return { ok: true, mimeType: input.mimeType, mediaType };
}
