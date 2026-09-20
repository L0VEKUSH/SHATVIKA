import crypto from 'node:crypto';
import type { MediaKind, SupportedMediaType } from '@/lib/mediaValidation';

export type MediaStorageScope = 'review' | 'admin-gallery';

type CloudinaryConfiguration = {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  timeoutMs: number;
};

export type MediaStorageConfiguration =
  | CloudinaryConfiguration
  | { provider: 'disabled'; reason: 'PROVIDER_NOT_CONFIGURED' | 'CLOUDINARY_CONFIGURATION_INCOMPLETE' };

export type StoredMedia = {
  provider: 'cloudinary';
  publicId: string;
  url: string;
  format: string;
  bytes: number;
  resourceType: MediaKind;
};

export class MediaStorageUnavailableError extends Error {
  readonly code = 'UPLOAD_STORAGE_NOT_CONFIGURED';

  constructor() {
    super('Durable media storage is not configured.');
    this.name = 'MediaStorageUnavailableError';
  }
}

export class MediaStorageOperationError extends Error {
  readonly code = 'MEDIA_STORAGE_OPERATION_FAILED';

  constructor() {
    super('The media storage provider could not complete the operation.');
    this.name = 'MediaStorageOperationError';
  }
}

function boundedTimeout(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed >= 5_000 && parsed <= 60_000 ? parsed : 30_000;
}

export function getMediaStorageConfiguration(env: NodeJS.ProcessEnv = process.env): MediaStorageConfiguration {
  if (env.MEDIA_STORAGE_PROVIDER !== 'cloudinary') {
    return { provider: 'disabled', reason: 'PROVIDER_NOT_CONFIGURED' };
  }
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim() ?? '';
  const apiKey = env.CLOUDINARY_API_KEY?.trim() ?? '';
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim() ?? '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cloudName) || !apiKey || !apiSecret) {
    return { provider: 'disabled', reason: 'CLOUDINARY_CONFIGURATION_INCOMPLETE' };
  }
  return {
    provider: 'cloudinary',
    cloudName,
    apiKey,
    apiSecret,
    timeoutMs: boundedTimeout(env.MEDIA_STORAGE_TIMEOUT_MS),
  };
}

/** Cloudinary signs the sorted, non-file request parameters plus the API secret. */
export function createCloudinarySignature(
  parameters: Readonly<Record<string, string | number | boolean>>,
  apiSecret: string,
): string {
  const canonical = Object.entries(parameters)
    .filter(([, value]) => value !== '' && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`, 'utf8').digest('hex');
}

function requiredConfiguration(env?: NodeJS.ProcessEnv): CloudinaryConfiguration {
  const configuration = getMediaStorageConfiguration(env);
  if (configuration.provider === 'disabled') throw new MediaStorageUnavailableError();
  return configuration;
}

function uniquePublicId(scope: MediaStorageScope, now: Date): string {
  const month = now.toISOString().slice(0, 7);
  return `shatvika/${scope}/${month}/${crypto.randomUUID()}`;
}

function expectedFormats(mimeType: SupportedMediaType): readonly string[] {
  if (mimeType === 'image/jpeg') return ['jpg', 'jpeg'];
  return [mimeType.split('/')[1]];
}

async function providerRequest(
  url: string,
  body: FormData,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) throw new MediaStorageOperationError();
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new MediaStorageOperationError();
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MediaStorageOperationError) throw error;
    throw new MediaStorageOperationError();
  }
}

export async function uploadMedia(input: {
  bytes: Uint8Array;
  mimeType: SupportedMediaType;
  mediaType: MediaKind;
  scope: MediaStorageScope;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<StoredMedia> {
  const configuration = requiredConfiguration(input.env);
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const publicId = uniquePublicId(input.scope, input.now ?? new Date());
  const signedParameters = {
    overwrite: false,
    public_id: publicId,
    timestamp,
  } as const;
  const form = new FormData();
  // Copy into an ArrayBuffer-backed view; Request/File inputs may expose a
  // SharedArrayBuffer-compatible view that is not a valid DOM BlobPart type.
  const uploadBytes = Uint8Array.from(input.bytes);
  form.set('file', new Blob([uploadBytes.buffer], { type: input.mimeType }), `media.${input.mimeType.split('/')[1]}`);
  form.set('api_key', configuration.apiKey);
  form.set('overwrite', String(signedParameters.overwrite));
  form.set('public_id', publicId);
  form.set('timestamp', String(timestamp));
  form.set('signature', createCloudinarySignature(signedParameters, configuration.apiSecret));
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(configuration.cloudName)}/${input.mediaType}/upload`;
  const payload = await providerRequest(endpoint, form, configuration.timeoutMs, input.fetchImpl ?? fetch);
  const returnedPublicId = typeof payload.public_id === 'string' ? payload.public_id : '';
  const secureUrl = typeof payload.secure_url === 'string' ? payload.secure_url : '';
  const format = typeof payload.format === 'string' ? payload.format.toLowerCase() : '';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(secureUrl);
  } catch {
    throw new MediaStorageOperationError();
  }
  if (
    returnedPublicId !== publicId ||
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'res.cloudinary.com' ||
    payload.resource_type !== input.mediaType ||
    !expectedFormats(input.mimeType).includes(format)
  ) {
    throw new MediaStorageOperationError();
  }
  return {
    provider: 'cloudinary',
    publicId,
    url: secureUrl,
    format,
    bytes: input.bytes.byteLength,
    resourceType: input.mediaType,
  };
}

export async function deleteMedia(input: {
  publicId: string;
  resourceType: MediaKind;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const configuration = requiredConfiguration(input.env);
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const signedParameters = { invalidate: true, public_id: input.publicId, timestamp } as const;
  const form = new FormData();
  form.set('api_key', configuration.apiKey);
  form.set('invalidate', String(signedParameters.invalidate));
  form.set('public_id', input.publicId);
  form.set('timestamp', String(timestamp));
  form.set('signature', createCloudinarySignature(signedParameters, configuration.apiSecret));
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(configuration.cloudName)}/${input.resourceType}/destroy`;
  const payload = await providerRequest(endpoint, form, configuration.timeoutMs, input.fetchImpl ?? fetch);
  if (payload.result !== 'ok' && payload.result !== 'not found') throw new MediaStorageOperationError();
}
