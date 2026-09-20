import { cookies } from 'next/headers';
import { connectToMongo } from '@/lib/mongoose';
import { signSessionToken, verifySessionToken, type SessionClaims } from '@/lib/sessionToken';
import { Admin } from '@/models/Admin';

export const ADMIN_COOKIE_NAME = 'admin_session';
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

export type AdminSessionState =
  | { status: 'valid'; accountId: string; claims: SessionClaims; permissions: string[] }
  | { status: 'invalid' | 'account_disabled' | 'database_unavailable' };

function secret(): string {
  return process.env.ADMIN_JWT_SECRET ?? '';
}

export function adminSessionConfigurationError(): string | null {
  const value = secret();
  if (!value) return 'ADMIN_JWT_SECRET is not configured';
  if (process.env.NODE_ENV === 'production' && new TextEncoder().encode(value).byteLength < 32) {
    return 'ADMIN_JWT_SECRET must contain at least 32 bytes in production';
  }
  return null;
}

export async function verifyAdminTokenState(token: string): Promise<AdminSessionState> {
  const claims = await verifySessionToken({ token, role: 'admin', secret: secret() });
  if (!claims) return { status: 'invalid' };
  try {
    await connectToMongo();
    const admin = await Admin.findById(claims.sub)
      .select('+passwordVersion isActive permissions role')
      .lean();
    if (!admin || admin.role !== 'admin') return { status: 'invalid' };
    if (admin.isActive === false) return { status: 'account_disabled' };
    const currentVersion = admin.passwordVersion ?? 0;
    if (!Number.isSafeInteger(currentVersion) || currentVersion !== claims.sv) {
      return { status: 'invalid' };
    }
    return {
      status: 'valid',
      accountId: claims.sub,
      claims,
      permissions: Array.isArray(admin.permissions) ? admin.permissions.map(String) : [],
    };
  } catch {
    return { status: 'database_unavailable' };
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  return (await verifyAdminTokenState(token)).status === 'valid';
}

export async function setAdminJwtSession(
  adminId: string,
  adminData: { passwordVersion?: number } | null | undefined,
) {
  const token = await signSessionToken({
    accountId: adminId,
    role: 'admin',
    sessionVersion: adminData?.passwordVersion ?? 0,
    lifetimeSeconds: ADMIN_SESSION_SECONDS,
    secret: secret(),
  });
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
    priority: 'high',
  });
}

export async function clearAdminJwtSession() {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getAdminSessionState(): Promise<AdminSessionState> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  return token ? verifyAdminTokenState(token) : { status: 'invalid' };
}

export async function isAdminJwtAuthed() {
  return (await getAdminSessionState()).status === 'valid';
}
