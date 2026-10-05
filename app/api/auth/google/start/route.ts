import { NextRequest, NextResponse } from 'next/server';
import { authRateLimit } from '@/lib/authRateLimit';
import { CUSTOMER_COOKIE_NAME, verifyCustomerTokenState } from '@/lib/customerJwt';
import { getGuestSessionFromRequest } from '@/lib/guestSession';
import { GOOGLE_OAUTH_COOKIE_NAME, googleOidcConfiguration, googleOidcSettings, hashGoogleOAuthState, oidc } from '@/lib/googleOidc';
import { connectToMongo } from '@/lib/mongoose';
import { safeReturnPath } from '@/lib/returnPath';
import { OAuthTransaction } from '@/models/OAuthTransaction';

const OAUTH_LIFETIME_SECONDS = 10 * 60;

export async function GET(request: NextRequest) {
  const settings = googleOidcSettings();
  if (!settings) {
    return NextResponse.redirect(new URL('/?googleError=GOOGLE_NOT_CONFIGURED', request.url));
  }

  try {
    const limited = await authRateLimit({ request, scope: 'google-auth-start', subject: 'browser', limit: 10, windowSeconds: 60 });
    if (!limited.allowed) return NextResponse.redirect(new URL('/?googleError=RATE_LIMITED', request.url));

    const purpose = request.nextUrl.searchParams.get('purpose') === 'link' ? 'link' : 'signin';
    const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'), '/');
    let linkUserId: string | null = null;
    if (purpose === 'link') {
      const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
      const state = token ? await verifyCustomerTokenState(token) : { status: 'invalid' as const };
      if (state.status !== 'valid') {
        return NextResponse.redirect(new URL('/auth/login?googleError=SIGN_IN_REQUIRED', request.url));
      }
      linkUserId = state.accountId;
    }

    await connectToMongo();
    const [configuration, guestSession] = await Promise.all([
      googleOidcConfiguration(settings),
      getGuestSessionFromRequest(request),
    ]);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const expiresAt = new Date(Date.now() + OAUTH_LIFETIME_SECONDS * 1000);
    await OAuthTransaction.create({
      stateHash: hashGoogleOAuthState(state),
      codeVerifier,
      nonce,
      provider: 'google',
      purpose,
      returnTo,
      linkUserId,
      guestSessionId: guestSession?.id ?? null,
      expiresAt,
    });

    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: settings.redirectUri,
      scope: 'openid email profile',
      response_type: 'code',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_COOKIE_NAME, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google/callback',
      maxAge: OAUTH_LIFETIME_SECONDS,
      priority: 'high',
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/?googleError=GOOGLE_SIGN_IN_UNAVAILABLE', request.url));
  }
}
