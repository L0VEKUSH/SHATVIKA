import { describe, expect, it } from 'vitest';
import { createCsrfToken, isTrustedMutationOrigin, verifyCsrfToken } from '@/lib/csrf';
import { safeReturnPath } from '@/lib/returnPath';
import { signSessionToken, verifySessionToken } from '@/lib/sessionToken';

const SECRET = 'test-only-secret-that-is-longer-than-thirty-two-bytes';
const ACCOUNT_ID = '507f1f77bcf86cd799439011';

describe('signed session claims', () => {
  it('accepts the intended role and rejects tampering or a different role', async () => {
    const token = await signSessionToken({
      accountId: ACCOUNT_ID,
      role: 'customer',
      sessionVersion: 4,
      lifetimeSeconds: 600,
      secret: SECRET,
      nowSeconds: 1_000,
      tokenId: 'test-token-identifier',
    });

    await expect(verifySessionToken({ token, role: 'customer', secret: SECRET, nowSeconds: 1_100 }))
      .resolves.toMatchObject({ sub: ACCOUNT_ID, role: 'customer', sv: 4, exp: 1_600 });
    await expect(verifySessionToken({ token, role: 'admin', secret: SECRET, nowSeconds: 1_100 }))
      .resolves.toBeNull();

    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${parts[2].endsWith('A') ? 'B' : 'A'}`;
    await expect(verifySessionToken({ token: tampered, role: 'customer', secret: SECRET, nowSeconds: 1_100 }))
      .resolves.toBeNull();
  });

  it('requires an unexpired, bounded lifetime and a valid database identifier subject', async () => {
    await expect(signSessionToken({
      accountId: 'not-an-object-id',
      role: 'customer',
      sessionVersion: 0,
      lifetimeSeconds: 60,
      secret: SECRET,
    })).rejects.toThrow('INVALID_SESSION_SUBJECT');

    const token = await signSessionToken({
      accountId: ACCOUNT_ID,
      role: 'admin',
      sessionVersion: 0,
      lifetimeSeconds: 60,
      secret: SECRET,
      nowSeconds: 2_000,
      tokenId: 'another-test-token',
    });
    await expect(verifySessionToken({ token, role: 'admin', secret: SECRET, nowSeconds: 2_091 }))
      .resolves.toBeNull();
  });
});

describe('CSRF and same-origin protections', () => {
  it('verifies the signed double-submit token and rejects expiry and tampering', async () => {
    const token = await createCsrfToken({
      secret: SECRET,
      nowSeconds: 10_000,
      ttlSeconds: 600,
      randomBytes: new Uint8Array(32).fill(7),
    });

    await expect(verifyCsrfToken(token, { secret: SECRET, nowSeconds: 10_100 }))
      .resolves.toEqual({ valid: true, expiresAt: 10_600 });
    await expect(verifyCsrfToken(token, { secret: SECRET, nowSeconds: 10_600 }))
      .resolves.toEqual({ valid: false });
    await expect(verifyCsrfToken(`${token.slice(0, -1)}A`, { secret: SECRET, nowSeconds: 10_100 }))
      .resolves.toEqual({ valid: false });
  });

  it('requires an explicitly trusted mutation origin', () => {
    const allowed = new Set(['https://shop.example']);
    expect(isTrustedMutationOrigin({
      requestOrigin: 'https://shop.example',
      origin: 'https://shop.example',
      referer: null,
      allowedOrigins: allowed,
    })).toBe(true);
    expect(isTrustedMutationOrigin({
      requestOrigin: 'https://shop.example',
      origin: 'https://attacker.example',
      referer: 'https://shop.example/checkout',
      allowedOrigins: allowed,
    })).toBe(false);
    expect(isTrustedMutationOrigin({
      requestOrigin: 'https://shop.example',
      origin: null,
      referer: null,
      allowedOrigins: allowed,
    })).toBe(false);
  });
});

describe('validated return paths', () => {
  it('preserves local destinations but blocks external and malformed redirects', () => {
    expect(safeReturnPath('/customer/orders?from=login#latest', '/customer'))
      .toBe('/customer/orders?from=login#latest');
    expect(safeReturnPath('//attacker.example/path', '/customer')).toBe('/customer');
    expect(safeReturnPath('https://attacker.example/path', '/customer')).toBe('/customer');
    expect(safeReturnPath('/customer\\..\\admin', '/customer')).toBe('/customer');
    expect(safeReturnPath('/customer\nadmin', '/customer')).toBe('/customer');
  });
});
