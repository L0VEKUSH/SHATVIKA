/**
 * Edge-safe signed-session primitive shared by middleware and Node route handlers.
 *
 * Times are Unix seconds. Database-backed account/session-version checks deliberately
 * live in adminJwt/customerJwt because middleware cannot query MongoDB.
 */

export const SESSION_ISSUER = 'shatvika-corner';
export const SESSION_AUDIENCE = 'shatvika-web';

export type SessionRole = 'admin' | 'customer' | 'worker';

export type SessionClaims = {
  iss: typeof SESSION_ISSUER;
  aud: typeof SESSION_AUDIENCE;
  sub: string;
  role: SessionRole;
  sv: number;
  iat: number;
  exp: number;
  jti: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CLOCK_SKEW_SECONDS = 30;
const MAX_SESSION_SECONDS = 31 * 24 * 60 * 60;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4096) {
    throw new Error('INVALID_BASE64URL');
  }
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) base64 += '='.repeat(4 - padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  if (process.env.NODE_ENV === 'production' && encoder.encode(secret).byteLength < 32) {
    throw new Error('SESSION_SECRET_TOO_SHORT');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function parseClaims(value: unknown, expectedRole: SessionRole, nowSeconds: number): SessionClaims | null {
  if (!value || typeof value !== 'object') return null;
  const claims = value as Partial<SessionClaims>;
  if (
    claims.iss !== SESSION_ISSUER ||
    claims.aud !== SESSION_AUDIENCE ||
    typeof claims.sub !== 'string' ||
    !/^[a-f\d]{24}$/i.test(claims.sub) ||
    claims.role !== expectedRole ||
    !Number.isSafeInteger(claims.sv) ||
    (claims.sv as number) < 0 ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    typeof claims.jti !== 'string' ||
    claims.jti.length < 16 ||
    claims.jti.length > 128
  ) {
    return null;
  }

  const issuedAt = claims.iat as number;
  const expiresAt = claims.exp as number;
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) return null;
  if (expiresAt <= nowSeconds - CLOCK_SKEW_SECONDS) return null;
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_SESSION_SECONDS) return null;
  return claims as SessionClaims;
}

export async function signSessionToken(input: {
  accountId: string;
  role: SessionRole;
  sessionVersion: number;
  lifetimeSeconds: number;
  secret: string;
  nowSeconds?: number;
  tokenId?: string;
}): Promise<string> {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!/^[a-f\d]{24}$/i.test(input.accountId)) throw new Error('INVALID_SESSION_SUBJECT');
  if (!Number.isSafeInteger(input.sessionVersion) || input.sessionVersion < 0) {
    throw new Error('INVALID_SESSION_VERSION');
  }
  if (!Number.isSafeInteger(input.lifetimeSeconds) || input.lifetimeSeconds <= 0 || input.lifetimeSeconds > MAX_SESSION_SECONDS) {
    throw new Error('INVALID_SESSION_LIFETIME');
  }

  const header = { alg: 'HS256', typ: 'JWT' } as const;
  const claims: SessionClaims = {
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    sub: input.accountId,
    role: input.role,
    sv: input.sessionVersion,
    iat: now,
    exp: now + input.lifetimeSeconds,
    jti: input.tokenId ?? crypto.randomUUID(),
  };
  const headerPart = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadPart = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const key = await importHmacKey(input.secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(input: {
  token: string;
  role: SessionRole;
  secret: string;
  nowSeconds?: number;
}): Promise<SessionClaims | null> {
  try {
    if (!input.token || input.token.length > 8192) return null;
    const parts = input.token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(decoder.decode(decodeBase64Url(headerPart))) as Record<string, unknown>;
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || Object.keys(header).some(key => key !== 'alg' && key !== 'typ')) {
      return null;
    }

    const key = await importHmacKey(input.secret);
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signaturePart),
      encoder.encode(`${headerPart}.${payloadPart}`),
    );
    if (!validSignature) return null;
    const payload = JSON.parse(decoder.decode(decodeBase64Url(payloadPart))) as unknown;
    return parseClaims(payload, input.role, input.nowSeconds ?? Math.floor(Date.now() / 1000));
  } catch {
    return null;
  }
}
