const COOKIE_NAME = 'admin_session';

const encoder = new TextEncoder();

function base64urlEncode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecodeToBytes(b64url: string) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBytes(text: string) {
  return encoder.encode(text);
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textToBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textToBytes(data));
  return new Uint8Array(signature);
}

async function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    // still run a constant-time-ish loop
    const max = Math.max(a.length, b.length);
    let diff = 0;
    for (let i = 0; i < max; i++) {
      const av = i < a.length ? a[i] : 0;
      const bv = i < b.length ? b[i] : 0;
      diff |= av ^ bv;
    }
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function getJwtSecret() {
  return process.env.ADMIN_JWT_SECRET ?? '';
}

function sha256Hex(data: string): string {
  // Web Crypto returns bytes; convert to hex string.
  // This function is sync in signature usage; we’ll do it async elsewhere.
  // Here we implement via subtle.digest with a blocking workaround is not possible.
  // So avoid calling this sync; use asyncDigestSha256Hex instead.
  throw new Error('sha256Hex should not be called in Edge runtime');
}

async function digestSha256Hex(data: string) {
  const hashBuf = await crypto.subtle.digest('SHA-256', textToBytes(data));
  const hashBytes = new Uint8Array(hashBuf);
  return Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyHS256(token: string): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
  const secret = getJwtSecret();
  if (!secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };

  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const expectedSigBytes = await hmacSha256(secret, data);
  const expectedB64 = base64urlEncode(expectedSigBytes);

  const sigBytes = base64urlDecodeToBytes(sigB64);
  const expectedBytes = base64urlDecodeToBytes(expectedB64);

  const ok = await timingSafeEqualBytes(sigBytes, expectedBytes);
  if (!ok) return { valid: false };

  try {
    const payloadJsonBytes = base64urlDecodeToBytes(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadJsonBytes);
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;

    const exp = payload?.exp;
    if (typeof exp === 'number' && Date.now() > exp) return { valid: false };

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const { valid, payload } = await verifyHS256(token);
  if (!valid || !payload) return false;

  // Check that fingerprint exists and is non-empty.
  if (typeof payload.fp !== 'string' || payload.fp.length === 0) return false;

  // Check that adminId exists and is non-empty.
  const adminId = payload.aid;
  if (typeof adminId !== 'string' || adminId.length === 0) return false;

  // Edge runtime can't access MongoDB, so we only validate token structure here.
  // Full admin existence check happens in Node.js verifyAdminToken in lib/adminJwt.ts
  // This is sufficient for middleware to allow requests through to Node handlers.
  return true;
}

// Exported for possible future use; Edge runtime can’t set cookies without next/headers.
// This module is intended strictly for Edge-safe verification in middleware.
export { COOKIE_NAME };
