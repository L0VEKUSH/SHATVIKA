import crypto from 'crypto';
import { cookies } from 'next/headers';
import { User } from '@/models/User';

const COOKIE_NAME = 'customer_session';

const encoder = new TextEncoder();

function base64url(input: Buffer | Uint8Array) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sha256(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getJwtSecret() {
  const secret = process.env.CUSTOMER_JWT_SECRET ?? '';
  return secret;
}

// Minimal JWT-like implementation (HS256) to avoid extra deps.
// Token payload is limited to customer id + expiry.
function signHS256(header: object, payload: object) {
  const secret = getJwtSecret();
  if (!secret) throw new Error('CUSTOMER_JWT_SECRET not configured');

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();

  return `${data}.${base64url(sig)}`;
}

export async function verifyCustomerToken(token: string): Promise<boolean> {
  const { valid, payload } = verifyHS256(token);
  if (!valid || !payload) return false;

  // Check that fingerprint exists and is non-empty.
  if (typeof payload.fp !== 'string' || payload.fp.length === 0) return false;

  // Check that userId exists and is non-empty.
  const userId = payload.uid;
  if (typeof userId !== 'string' || userId.length === 0) return false;

  // Verify the user still exists in MongoDB.
  try {
    const user = await User.findById(userId).lean();
    if (!user) return false;
    return true;
  } catch {
    return false;
  }
}

function verifyHS256(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  const secret = getJwtSecret();
  if (!secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const [headerB64, payloadB64, sigB64] = parts;

  const data = `${headerB64}.${payloadB64}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();

  const expectedB64 = base64url(expected);
  // timingSafeEqual for signature
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedB64);
  if (a.length !== b.length) return { valid: false };
  const ok = crypto.timingSafeEqual(a, b);
  if (!ok) return { valid: false };

  try {
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (typeof payload?.exp === 'number' && Date.now() > payload.exp) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

/**
 * Set customer JWT session cookie.
 * @param userId Customer user ID
 * @param userData Full customer document
 * @param rememberMe If true, set 30-day expiry; otherwise 8 hours
 */
export async function setCustomerJwtSession(userId?: string, userData?: any, rememberMe: boolean = false) {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) throw new Error('CUSTOMER_JWT_SECRET not configured');

  // exp: 8 hours or 30 days
  const expiryMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 8 * 1000;
  const exp = Date.now() + expiryMs;

  const subject = 'customer';

  // Fingerprint includes userId, passwordVersion, and last 20 chars of password hash
  // so that old tokens invalidate when password changes.
  let fingerprintData = `${userId ?? ''}`;
  if (userData && userData.password && userData.passwordVersion !== undefined) {
    const passwordSuffix = String(userData.password ?? '').slice(-20);
    fingerprintData = `${userId}:${userData.passwordVersion}:${passwordSuffix}`;
  }
  const fingerprint = sha256(fingerprintData);

  const token = signHS256(
    { alg: 'HS256', typ: 'JWT' },
    { sub: subject, uid: userId, fp: fingerprint, exp }
  );

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(expiryMs / 1000),
  });
}

export async function clearCustomerJwtSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isCustomerJwtAuthed() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifyCustomerToken(token);
}

/**
 * Get the current customer ID from the JWT cookie (without verifying in DB).
 * Use this in contexts where you need the ID without a database hit.
 * For security checks, use isCustomerJwtAuthed() which does verify in DB.
 */
export async function getCustomerIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const { valid, payload } = verifyHS256(token);
  if (!valid || !payload) return null;

  const userId = payload.uid;
  if (typeof userId !== 'string') return null;

  return userId;
}
