import { verifySessionToken } from '@/lib/sessionToken';

export const COOKIE_NAME = 'admin_session';

/** Edge verification validates signature and required claims. Database state is checked by route handlers. */
export async function verifyAdminToken(token: string): Promise<boolean> {
  return Boolean(await verifySessionToken({
    token,
    role: 'admin',
    secret: process.env.ADMIN_JWT_SECRET ?? '',
  }));
}
