import { describe, expect, it, vi } from 'vitest';
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetDeliveryConfig,
  hashPasswordResetToken,
  isPasswordResetTokenFormat,
  sendPasswordResetEmail,
} from '@/lib/passwordReset';

describe('password-reset delivery contract', () => {
  it('creates a high-entropy token and stores only its deterministic hash', () => {
    const token = createPasswordResetToken();
    expect(isPasswordResetTokenFormat(token)).toBe(true);
    expect(token).toHaveLength(64);
    expect(hashPasswordResetToken(token)).toMatch(/^[a-f\d]{64}$/);
    expect(hashPasswordResetToken(token)).not.toBe(token);
  });

  it('fails closed when delivery configuration is incomplete or insecure in production', () => {
    expect(getPasswordResetDeliveryConfig({})).toBeNull();
    expect(getPasswordResetDeliveryConfig({
      NODE_ENV: 'production',
      RESEND_API_KEY: 'test-key',
      PASSWORD_RESET_FROM_EMAIL: 'support@example.test',
      NEXT_PUBLIC_APP_URL: 'http://example.test',
    })).toBeNull();
    expect(getPasswordResetDeliveryConfig({
      NODE_ENV: 'production',
      RESEND_API_KEY: 'test-key',
      PASSWORD_RESET_FROM_EMAIL: 'support@example.test',
      NEXT_PUBLIC_APP_URL: 'https://example.test/some/path',
    })).toEqual({
      apiKey: 'test-key',
      from: 'support@example.test',
      applicationOrigin: 'https://example.test',
    });
  });

  it('builds a same-origin reset page URL and calls the configured provider once', async () => {
    const token = 'a'.repeat(64);
    const config = {
      apiKey: 'provider-test-key',
      from: 'support@example.test',
      applicationOrigin: 'https://shop.example',
    };
    expect(buildPasswordResetUrl(config, token))
      .toBe(`https://shop.example/auth/reset-password?token=${token}`);

    let requestCount = 0;
    let capturedUrl: URL | RequestInfo | undefined;
    let capturedRequest: RequestInit | undefined;
    const fetchImplementation = async (url: URL | RequestInfo, request?: RequestInit) => {
      requestCount += 1;
      capturedUrl = url;
      capturedRequest = request;
      return new Response(null, { status: 202 });
    };
    await sendPasswordResetEmail({
      recipient: 'customer@example.test',
      token,
      config,
      fetchImplementation,
    });

    expect(requestCount).toBe(1);
    expect(capturedUrl).toBe('https://api.resend.com/emails');
    expect(capturedRequest?.method).toBe('POST');
    expect(new Headers(capturedRequest?.headers).get('authorization')).toBe('Bearer provider-test-key');
    expect(new Headers(capturedRequest?.headers).get('idempotency-key')).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      from: 'support@example.test',
      to: ['customer@example.test'],
    });
  });

  it('does not report provider rejection as successful delivery', async () => {
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(sendPasswordResetEmail({
      recipient: 'customer@example.test',
      token: 'b'.repeat(64),
      config: {
        apiKey: 'provider-test-key',
        from: 'support@example.test',
        applicationOrigin: 'https://shop.example',
      },
      fetchImplementation,
    })).rejects.toThrow('EMAIL_PROVIDER_REJECTED_503');
  });
});
