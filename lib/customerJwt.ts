import { cookies } from 'next/headers';
import { connectToMongo } from '@/lib/mongoose';
import { signSessionToken, verifySessionToken, type SessionClaims } from '@/lib/sessionToken';
import { User } from '@/models/User';

export const CUSTOMER_COOKIE_NAME = 'customer_session';
const SHORT_SESSION_SECONDS = 8 * 60 * 60;
const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;

export type CustomerSessionState =
  | { status: 'valid'; accountId: string; claims: SessionClaims }
  | { status: 'invalid' | 'account_disabled' | 'database_unavailable' };

function secret(): string {
  return process.env.CUSTOMER_JWT_SECRET ?? '';
}

export function customerSessionConfigurationError(): string | null {
  const value = secret();
  if (!value) return 'CUSTOMER_JWT_SECRET is not configured';
  if (process.env.NODE_ENV === 'production' && new TextEncoder().encode(value).byteLength < 32) {
    return 'CUSTOMER_JWT_SECRET must contain at least 32 bytes in production';
  }
  return null;
}

export async function verifyCustomerTokenState(token: string): Promise<CustomerSessionState> {
  const claims = await verifySessionToken({ token, role: 'customer', secret: secret() });
  if (!claims) return { status: 'invalid' };
  try {
    await connectToMongo();
    const user = await User.findById(claims.sub).select('+passwordVersion isActive').lean();
    if (!user) return { status: 'invalid' };
    if (user.isActive === false) return { status: 'account_disabled' };
    const currentVersion = user.passwordVersion ?? 0;
    if (!Number.isSafeInteger(currentVersion) || currentVersion !== claims.sv) {
      return { status: 'invalid' };
    }
    return { status: 'valid', accountId: claims.sub, claims };
  } catch {
    return { status: 'database_unavailable' };
  }
}

export async function verifyCustomerToken(token: string): Promise<boolean> {
  return (await verifyCustomerTokenState(token)).status === 'valid';
}

export async function setCustomerJwtSession(
  userId: string,
  userData: { passwordVersion?: number } | null | undefined,
  rememberMe = false,
) {
  const lifetimeSeconds = rememberMe ? REMEMBERED_SESSION_SECONDS : SHORT_SESSION_SECONDS;
  const token = await signSessionToken({
    accountId: userId,
    role: 'customer',
    sessionVersion: userData?.passwordVersion ?? 0,
    lifetimeSeconds,
    secret: secret(),
  });
  const store = await cookies();
  store.set(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: lifetimeSeconds,
    priority: 'high',
  });
}

export async function clearCustomerJwtSession() {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getCustomerSessionState(): Promise<CustomerSessionState> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE_NAME)?.value;
  return token ? verifyCustomerTokenState(token) : { status: 'invalid' };
}

export async function isCustomerJwtAuthed() {
  return (await getCustomerSessionState()).status === 'valid';
}

export async function getCustomerIdFromCookie(): Promise<string | null> {
  const state = await getCustomerSessionState();
  return state.status === 'valid' ? state.accountId : null;
}
