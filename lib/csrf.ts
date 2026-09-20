export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) throw new Error('INVALID_TOKEN');
  let encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  if (encoded.length % 4) encoded += '='.repeat(4 - (encoded.length % 4));
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function configuredSecret(): string {
  const explicit = process.env.CSRF_SECRET ?? '';
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== 'production') {
    return process.env.CUSTOMER_JWT_SECRET || process.env.ADMIN_JWT_SECRET || '';
  }
  return '';
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('CSRF_SECRET_NOT_CONFIGURED');
  if (process.env.NODE_ENV === 'production' && encoder.encode(secret).byteLength < 32) {
    throw new Error('CSRF_SECRET_TOO_SHORT');
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createCsrfToken(options?: {
  secret?: string;
  nowSeconds?: number;
  ttlSeconds?: number;
  randomBytes?: Uint8Array;
}): Promise<string> {
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options?.ttlSeconds ?? CSRF_TTL_SECONDS;
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 24 * 60 * 60) throw new Error('INVALID_CSRF_TTL');
  const random = options?.randomBytes ?? crypto.getRandomValues(new Uint8Array(32));
  if (random.byteLength < 16) throw new Error('INSUFFICIENT_CSRF_ENTROPY');
  const payload = `${encodeBase64Url(random)}.${now + ttl}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(options?.secret ?? configuredSecret()), encoder.encode(payload));
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyCsrfToken(token: string, options?: {
  secret?: string;
  nowSeconds?: number;
}): Promise<{ valid: boolean; expiresAt?: number }> {
  try {
    if (!token || token.length > 1024) return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const [random, expiryText, signature] = parts;
    decodeBase64Url(random);
    const expiresAt = Number(expiryText);
    const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 24 * 60 * 60) {
      return { valid: false };
    }
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(options?.secret ?? configuredSecret()),
      decodeBase64Url(signature),
      encoder.encode(`${random}.${expiryText}`),
    );
    return valid ? { valid: true, expiresAt } : { valid: false };
  } catch {
    return { valid: false };
  }
}

export function allowedApplicationOrigins(requestOrigin: string): Set<string> {
  const origins = new Set<string>([requestOrigin]);
  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!candidate) continue;
    try { origins.add(new URL(candidate).origin); } catch { /* Invalid configuration is not trusted. */ }
  }
  return origins;
}

export function isTrustedMutationOrigin(input: {
  requestOrigin: string;
  origin: string | null;
  referer: string | null;
  allowedOrigins?: ReadonlySet<string>;
}): boolean {
  const allowed = input.allowedOrigins ?? allowedApplicationOrigins(input.requestOrigin);
  const candidate = input.origin || input.referer;
  if (!candidate) return false;
  try {
    return allowed.has(new URL(candidate).origin);
  } catch {
    return false;
  }
}
