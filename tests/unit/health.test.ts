import { describe, expect, it } from 'vitest';
import { assessRuntimeConfiguration } from '@/lib/health';

const complete = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://shop.example.test',
  NEXT_PUBLIC_SITE_URL: 'https://shop.example.test',
  ADMIN_JWT_SECRET: 'admin-session-secret-that-is-at-least-32-bytes',
  CUSTOMER_JWT_SECRET: 'customer-session-secret-that-is-at-least-32-bytes',
  WORKER_JWT_SECRET: 'worker-session-secret-that-is-at-least-thirty-two-bytes',
  CSRF_SECRET: 'csrf-signing-secret-that-is-at-least-32-bytes',
  TRUSTED_PROXY_HOPS: '1',
  ADMIN_BOOTSTRAP_ENABLED: 'false',
  TAX_RATE_BASIS_POINTS: '500',
  DELIVERY_ENABLED: 'false',
  COUNTER_LOCATION_ID: 'test-counter',
  COUNTER_LOCATION_NAME: 'Test Counter',
  BUSINESS_TIME_ZONE: 'Asia/Kolkata',
  DELIVERY_FEE_PAISE: '4000',
  FREE_DELIVERY_THRESHOLD_PAISE: '50000',
  SERVICEABLE_POSTAL_CODES: '110001,110002',
};

describe('runtime configuration health', () => {
  it('marks a complete core configuration ready while optional integrations stay disabled', () => {
    const result = assessRuntimeConfiguration(complete);

    expect(result.ready).toBe(true);
    expect(result.required).toEqual({
      canonicalOrigin: true,
      sessionSecurity: true,
      checkoutRules: true,
      clientIpRateLimiting: true,
      adminBootstrapDisabled: true,
    });
    expect(result.integrations).toEqual({
      passwordResetEmail: 'disabled',
      durableMedia: 'disabled',
      onlinePayments: 'disabled',
    });
  });

  it('fails session readiness for short, missing, or reused production secrets', () => {
    const result = assessRuntimeConfiguration({
      ...complete,
      CUSTOMER_JWT_SECRET: complete.ADMIN_JWT_SECRET,
    });

    expect(result.ready).toBe(false);
    expect(result.required.sessionSecurity).toBe(false);
  });

  it('requires aligned HTTPS origins in production', () => {
    const result = assessRuntimeConfiguration({
      ...complete,
      NEXT_PUBLIC_APP_URL: 'https://app.example.test',
      NEXT_PUBLIC_SITE_URL: 'https://www.example.test',
    });

    expect(result.ready).toBe(false);
    expect(result.required.canonicalOrigin).toBe(false);
  });

  it('does not report checkout ready when the counter location or disabled-delivery capability is implicit', () => {
    const missingLocation: Record<string, string> = { ...complete };
    delete missingLocation.COUNTER_LOCATION_ID;
    expect(assessRuntimeConfiguration(missingLocation).required.checkoutRules).toBe(false);

    expect(assessRuntimeConfiguration({
      ...complete,
      DELIVERY_ENABLED: 'true',
    }).required.checkoutRules).toBe(false);
  });

  it('requires safe production proxy rate limiting and disabled admin bootstrap', () => {
    const missingProxy = assessRuntimeConfiguration({
      ...complete,
      TRUSTED_PROXY_HOPS: '0',
    });
    expect(missingProxy.ready).toBe(false);
    expect(missingProxy.required.clientIpRateLimiting).toBe(false);

    const bootstrapEnabled = assessRuntimeConfiguration({
      ...complete,
      ADMIN_BOOTSTRAP_ENABLED: 'true',
    });
    expect(bootstrapEnabled.ready).toBe(false);
    expect(bootstrapEnabled.required.adminBootstrapDisabled).toBe(false);
  });

  it('reports partially configured optional integrations without exposing their values', () => {
    const result = assessRuntimeConfiguration({
      ...complete,
      RESEND_API_KEY: 'provider-key',
      MEDIA_STORAGE_PROVIDER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'example-cloud',
    });

    expect(result.ready).toBe(false);
    expect(result.integrations.passwordResetEmail).toBe('misconfigured');
    expect(result.integrations.durableMedia).toBe('misconfigured');
    expect(JSON.stringify(result)).not.toContain('provider-key');
    expect(JSON.stringify(result)).not.toContain('example-cloud');
  });
});
