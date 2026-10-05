import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const customerTokenState = vi.hoisted(() => vi.fn());

vi.mock('@/lib/customerJwt', () => ({
  CUSTOMER_COOKIE_NAME: 'customer_session',
  verifyCustomerTokenState: customerTokenState,
}));

vi.mock('@/lib/adminJwt', () => ({
  ADMIN_COOKIE_NAME: 'admin_session',
  verifyAdminTokenState: vi.fn(async () => ({ status: 'invalid' })),
}));

import { POST as uploadMedia } from '@/app/api/upload/route';

beforeEach(() => {
  delete process.env.MEDIA_STORAGE_PROVIDER;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  customerTokenState.mockReset();
  customerTokenState.mockResolvedValue({
    status: 'valid',
    accountId: '507f1f77bcf86cd799439011',
  });
});

describe('upload route configuration boundary', () => {
  it('attributes the disabled-provider response only to a real media upload request', async () => {
    const request = new NextRequest('http://localhost/api/upload?scope=review', {
      method: 'POST',
      headers: { cookie: 'customer_session=test-session' },
    });

    const response = await uploadMedia(request);

    expect(response.status).toBe(503);
    expect(response.headers.get('x-shatvika-operation')).toBe('media-upload');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'UPLOAD_STORAGE_NOT_CONFIGURED',
      message: 'Durable media uploads are unavailable until object storage is configured. Missing: MEDIA_STORAGE_PROVIDER',
      details: { missing: ['MEDIA_STORAGE_PROVIDER'] }
    });
  });
});
