import { verifySessionToken } from '@/lib/sessionToken';

export const COOKIE_NAME = 'customer_session';

/** Edge verification validates signature and required claims. Database state is checked by route handlers. */
export async function verifyCustomerToken(token: string): Promise<boolean> {
  return Boolean(await verifySessionToken({
    token,
    role: 'customer',
    secret: process.env.CUSTOMER_JWT_SECRET ?? '',
  }));
}
