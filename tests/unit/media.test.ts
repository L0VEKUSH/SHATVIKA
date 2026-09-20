import { describe, expect, it, vi } from 'vitest';
import {
  createCloudinarySignature,
  getMediaStorageConfiguration,
  MediaStorageUnavailableError,
  uploadMedia,
} from '@/lib/mediaStorage';
import { validateMediaFile } from '@/lib/mediaValidation';

describe('media validation and durable storage contract', () => {
  it('checks MIME, extension, content signature, size, and review scope', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    expect(validateMediaFile({ bytes: png, filename: 'proof.png', mimeType: 'image/png', scope: 'review' }))
      .toEqual({ ok: true, mimeType: 'image/png', mediaType: 'image' });
    expect(validateMediaFile({ bytes: png, filename: 'proof.jpg', mimeType: 'image/png', scope: 'review' }))
      .toEqual({ ok: false, error: 'EXTENSION_MISMATCH' });
    expect(validateMediaFile({ bytes: Uint8Array.from([1, 2, 3]), filename: 'proof.png', mimeType: 'image/png', scope: 'review' }))
      .toEqual({ ok: false, error: 'INVALID_FILE_CONTENT' });
    const mp4 = Uint8Array.from([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
    expect(validateMediaFile({ bytes: mp4, filename: 'clip.mp4', mimeType: 'video/mp4', scope: 'review' }))
      .toEqual({ ok: false, error: 'VIDEOS_NOT_ALLOWED' });
  });

  it('stays disabled for absent or partial provider configuration', async () => {
    expect(getMediaStorageConfiguration({} as NodeJS.ProcessEnv)).toEqual({
      provider: 'disabled', reason: 'PROVIDER_NOT_CONFIGURED',
    });
    expect(getMediaStorageConfiguration({ MEDIA_STORAGE_PROVIDER: 'cloudinary' } as unknown as NodeJS.ProcessEnv)).toEqual({
      provider: 'disabled', reason: 'CLOUDINARY_CONFIGURATION_INCOMPLETE',
    });
    await expect(uploadMedia({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', mediaType: 'image',
      scope: 'review', env: {} as NodeJS.ProcessEnv,
    })).rejects.toBeInstanceOf(MediaStorageUnavailableError);
  });

  it('signs and verifies the provider response contract without a network call', async () => {
    expect(createCloudinarySignature({ timestamp: 123, overwrite: false, public_id: 'x' }, 'secret'))
      .toMatch(/^[a-f0-9]{40}$/);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const publicId = String(form.get('public_id'));
      return new Response(JSON.stringify({
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/demo/image/upload/${publicId}.png`,
        resource_type: 'image',
        format: 'png',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const result = await uploadMedia({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: 'image/png', mediaType: 'image', scope: 'admin-gallery',
      now: new Date('2026-09-13T00:00:00.000Z'),
      env: {
        MEDIA_STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret',
      } as unknown as NodeJS.ProcessEnv,
      fetchImpl: fetchMock as typeof fetch,
    });
    expect(result).toMatchObject({ provider: 'cloudinary', resourceType: 'image', format: 'png', bytes: 8 });
    expect(result.publicId).toMatch(/^shatvika\/admin-gallery\/2026-09\/[a-f0-9-]+$/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
