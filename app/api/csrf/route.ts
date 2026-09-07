import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

/**
 * CSRF Token Endpoint
 *
 * Generates cryptographically secure CSRF tokens for POST/PUT/DELETE requests
 * Tokens are stored in HTTP-only cookies and validated on the server side
 *
 * Client flow:
 * 1. GET /api/csrf to retrieve token (set as HTTP-only cookie)
 * 2. Include token in X-CSRF-Token header or form data for state-changing requests
 * 3. Server validates token matches cookie
 */

export const dynamic = 'force-dynamic';

// Token storage: In production, use Redis for distributed systems
const csrfTokens: Map<string, { token: string; createdAt: number }> = new Map();

// Cleanup expired tokens every 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [key, entry] of csrfTokens.entries()) {
    if (now - entry.createdAt > maxAge) {
      csrfTokens.delete(key);
    }
  }
}, 30 * 60 * 1000);

/**
 * Generate a new CSRF token
 * @returns Cryptographically secure token (32 bytes)
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * GET /api/csrf
 * Returns a CSRF token for use in subsequent state-changing requests
 * Token is also set as HTTP-only cookie: X-CSRF-Token
 */
export async function GET() {
  try {
    const token = generateToken();
    const tokenId = randomBytes(16).toString('hex');

    // Store token with creation time (for expiration checks)
    csrfTokens.set(tokenId, { token, createdAt: Date.now() });

    // Return token in response (client includes in X-CSRF-Token header)
    // Also set as HTTP-only cookie for double-submit protection
    const response = NextResponse.json(
      {
        ok: true,
        token,
        message: 'Include token in X-CSRF-Token header for state-changing requests',
      },
      { status: 200 }
    );

    // Set HTTP-only, Secure, SameSite cookie (server-side validation)
    response.cookies.set({
      name: 'X-CSRF-Token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[GET /api/csrf] Token generation failed:', err);
    return NextResponse.json(
      { ok: false, error: 'TOKEN_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}

/**
 * Validate CSRF token from request
 * Used by middleware to protect state-changing operations
 *
 * @param headerToken - Token from X-CSRF-Token header
 * @param cookieToken - Token from X-CSRF-Token cookie
 * @returns boolean - true if tokens match, false otherwise
 */
function validateCSRFToken(
  headerToken?: string,
  cookieToken?: string
): boolean {
  // Both tokens must exist
  if (!headerToken || !cookieToken) {
    return false;
  }

  // Tokens must match exactly (double-submit cookie pattern)
  return headerToken === cookieToken;
}
