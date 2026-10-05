import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { setCustomerSession } from '@/lib/customerAuth';
import { CUSTOMER_COOKIE_NAME, verifyCustomerTokenState } from '@/lib/customerJwt';
import { GOOGLE_OAUTH_COOKIE_NAME, googleOidcConfiguration, googleOidcSettings, hashGoogleOAuthState, oidc } from '@/lib/googleOidc';
import { connectToMongo } from '@/lib/mongoose';
import { safeReturnPath } from '@/lib/returnPath';
import { OAuthTransaction } from '@/models/OAuthTransaction';
import { User } from '@/models/User';

function sameValue(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function errorRedirect(request: NextRequest, code: string, returnTo = '/') {
  const target = new URL(safeReturnPath(returnTo, '/'), request.url);
  target.searchParams.set('googleError', code);
  const response = NextResponse.redirect(target);
  response.cookies.delete(GOOGLE_OAUTH_COOKIE_NAME);
  return response;
}

export async function GET(request: NextRequest) {
  const settings = googleOidcSettings();
  if (!settings) return errorRedirect(request, 'GOOGLE_NOT_CONFIGURED');
  const returnedState = request.nextUrl.searchParams.get('state') ?? '';
  const cookieState = request.cookies.get(GOOGLE_OAUTH_COOKIE_NAME)?.value ?? '';
  if (!returnedState || !cookieState || !sameValue(returnedState, cookieState)) {
    return errorRedirect(request, 'GOOGLE_STATE_INVALID');
  }

  try {
    await connectToMongo();
    const now = new Date();
    const transaction = await OAuthTransaction.findOneAndUpdate(
      { stateHash: hashGoogleOAuthState(returnedState), provider: 'google', usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { returnDocument: 'before' },
    ).select('+codeVerifier +nonce +stateHash').lean();
    if (!transaction) return errorRedirect(request, 'GOOGLE_STATE_EXPIRED');

    const configuration = await googleOidcConfiguration(settings);
    const tokens = await oidc.authorizationCodeGrant(configuration, new URL(request.url), {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: returnedState,
      expectedNonce: transaction.nonce,
    });
    const claims = tokens.claims();
    const subject = typeof claims?.sub === 'string' ? claims.sub : '';
    const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
    const emailVerified = claims?.email_verified === true;
    const displayName = typeof claims?.name === 'string' && claims.name.trim()
      ? claims.name.trim().slice(0, 120)
      : 'Google customer';
    if (!subject || !email || !emailVerified) return errorRedirect(request, 'GOOGLE_IDENTITY_INVALID', transaction.returnTo);

    let user: any;
    if (transaction.purpose === 'link') {
      const sessionToken = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
      const sessionState = sessionToken ? await verifyCustomerTokenState(sessionToken) : { status: 'invalid' as const };
      if (sessionState.status !== 'valid' || String(transaction.linkUserId ?? '') !== sessionState.accountId) {
        return errorRedirect(request, 'GOOGLE_LINK_SESSION_INVALID', transaction.returnTo);
      }
      const alreadyOwned = await User.findOne({ googleSubject: subject }).select('_id').lean();
      if (alreadyOwned && String(alreadyOwned._id) !== sessionState.accountId) {
        return errorRedirect(request, 'GOOGLE_IDENTITY_ALREADY_LINKED', transaction.returnTo);
      }
      user = await User.findByIdAndUpdate(
        sessionState.accountId,
        { $set: { googleSubject: subject } },
        { returnDocument: 'after', runValidators: true },
      ).select('+passwordVersion');
    } else {
      user = await User.findOne({ googleSubject: subject }).select('+passwordVersion +googleSubject');
      if (!user) {
        // Matching email is deliberately treated as a conflict. A signed-in
        // password customer must use the explicit linking flow.
        const emailOwner = await User.findOne({ email }).select('_id authProvider').lean();
        if (emailOwner) return errorRedirect(request, 'ACCOUNT_LINK_REQUIRED', transaction.returnTo);
        user = await User.create({
          email,
          fullName: displayName,
          authProvider: 'google',
          googleSubject: subject,
          password: null,
          isActive: true,
        });
      }
    }
    if (!user || user.isActive === false) return errorRedirect(request, 'GOOGLE_ACCOUNT_UNAVAILABLE', transaction.returnTo);

    await setCustomerSession(String(user._id), user, true);
    const target = new URL(safeReturnPath(transaction.returnTo, '/'), request.url);
    if (transaction.guestSessionId) target.searchParams.set('guestOrders', 'available');
    const response = NextResponse.redirect(target);
    response.cookies.delete(GOOGLE_OAUTH_COOKIE_NAME);
    return response;
  } catch {
    return errorRedirect(request, 'GOOGLE_SIGN_IN_FAILED');
  }
}
