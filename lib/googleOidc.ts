import * as oidc from 'openid-client';
import { createHash } from 'node:crypto';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');
export const GOOGLE_OAUTH_COOKIE_NAME = 'shatvika_google_state';

export function hashGoogleOAuthState(state: string) {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

export type GoogleOidcSettings = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleOidcSettings(): GoogleOidcSettings | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const parsed = new URL(redirectUri);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.pathname !== '/api/auth/google/callback') return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

let cachedConfiguration: Promise<oidc.Configuration> | null = null;

export function googleOidcConfiguration(settings: GoogleOidcSettings): Promise<oidc.Configuration> {
  cachedConfiguration ??= oidc.discovery(GOOGLE_ISSUER, settings.clientId, settings.clientSecret);
  return cachedConfiguration;
}

export { oidc };
