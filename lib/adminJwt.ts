import crypto from 'crypto';
import { cookies } from 'next/headers';
import { Admin } from '@/models/Admin';

const COOKIE_NAME = 'admin_session';

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
  const secret = process.env.ADMIN_JWT_SECRET ?? '';
  return secret;
}

// Minimal JWT-like implementation (HS256) to avoid extra deps.
// Token payload is limited to admin id + expiry.
function signHS256(header: object, payload: object) {
  const secret = getJwtSecret();
  if (!secret) throw new Error('ADMIN_JWT_SECRET not configured');

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest();

  return `${data}.${base64url(sig)}`;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const { valid, payload } = verifyHS256(token);
  if (!valid || !payload) return false;

  // Check that fingerprint exists and is non-empty.
  if (typeof payload.fp !== 'string' || payload.fp.length === 0) return false;

  // Check that adminId exists and is non-empty.
  const adminId = payload.aid;
  if (typeof adminId !== 'string' || adminId.length === 0) return false;

  // Verify the admin still exists in MongoDB.
  try {
    const admin = await Admin.findById(adminId).lean();
    if (!admin) return false;
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

// New: adminId-based session for MongoDB auth.
// adminData is the full admin document needed to extract password hash for fingerprint.
export async function setAdminJwtSession(adminId?: string, adminData?: any) {

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) throw new Error('ADMIN_JWT_SECRET not configured');

  // exp: 8 hours
  const exp = Date.now() + 60 * 60 * 8 * 1000;

  const subject = 'admin';

  // Fingerprint includes adminId, passwordVersion, and last 20 chars of password hash
  // so that old tokens invalidate when password changes.
  let fingerprintData = `${adminId ?? ''}`;
  if (adminData && adminData.password && adminData.passwordVersion !== undefined) {
    const passwordSuffix = String(adminData.password ?? '').slice(-20);
    fingerprintData = `${adminId}:${adminData.passwordVersion}:${passwordSuffix}`;
  }
  const fingerprint = sha256(fingerprintData);

  const token = signHS256(
    { alg: 'HS256', typ: 'JWT' },
    { sub: subject, aid: adminId, fp: fingerprint, exp }
  );

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}


export async function clearAdminJwtSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAdminJwtAuthed() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return await verifyAdminToken(token);
}

