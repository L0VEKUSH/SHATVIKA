const COOKIE_NAME = 'customer_session';

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
  return process.env.CUSTOMER_JWT_SECRET ?? '';
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

/**
 * Verify customer JWT token in Edge runtime.
 * This checks token structure and expiry but not database user existence
 * (Edge runtime cannot access MongoDB).
 * Full customer verification happens in Node.js layer with isCustomerAuthed().
 */
export async function verifyCustomerToken(token: string): Promise<boolean> {
  const { valid, payload } = await verifyHS256(token);
  if (!valid || !payload) return false;

  // Check that fingerprint exists and is non-empty.
  if (typeof payload.fp !== 'string' || payload.fp.length === 0) return false;

  // Check that userId exists and is non-empty.
  const userId = payload.uid;
  if (typeof userId !== 'string' || userId.length === 0) return false;

  // Edge runtime can't access MongoDB, so we only validate token structure here.
  // Full customer existence check happens in Node.js verifyCustomerToken in lib/customerJwt.ts
  // This is sufficient for middleware to allow requests through to Node handlers.
  return true;
}

// Exported for middleware use
export { COOKIE_NAME };
