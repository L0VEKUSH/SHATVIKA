import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { GuestSession } from '@/models/GuestSession';

export const GUEST_SESSION_COOKIE_NAME = 'shatvika_guest';
export const GUEST_SESSION_SECONDS = 30 * 24 * 60 * 60;

export type GuestSessionState = {
  id: string;
  expiresAt: Date;
};

export type IssuedGuestSession = GuestSessionState & {
  cookieToken?: string;
};

export function hashGuestSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function validCookieToken(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

export function guestSessionHashFromRequest(request: NextRequest): string | null {
  const rawToken = request.cookies.get(GUEST_SESSION_COOKIE_NAME)?.value;
  return validCookieToken(rawToken) ? hashGuestSessionToken(rawToken) : null;
}

export async function getGuestSessionFromRequest(
  request: NextRequest,
  { touch = false, now = new Date() }: { touch?: boolean; now?: Date } = {},
): Promise<GuestSessionState | null> {
  const rawToken = request.cookies.get(GUEST_SESSION_COOKIE_NAME)?.value;
  if (!validCookieToken(rawToken)) return null;
  await connectToMongo();
  const filter = {
    tokenHash: hashGuestSessionToken(rawToken),
    expiresAt: { $gt: now },
    revokedAt: null,
    claimedByUserId: null,
  };
  const session = touch
    ? await GuestSession.findOneAndUpdate(filter, { $set: { lastSeenAt: now } }, { returnDocument: 'after' }).lean()
    : await GuestSession.findOne(filter).lean();
  if (!session) return null;
  return { id: String(session._id), expiresAt: new Date(session.expiresAt) };
}

export async function ensureGuestSession(
  request: NextRequest,
  now = new Date(),
): Promise<IssuedGuestSession> {
  const existing = await getGuestSessionFromRequest(request, { touch: true, now });
  if (existing) return existing;

  await connectToMongo();
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_SECONDS * 1000);
  const created = await GuestSession.create({
    tokenHash: hashGuestSessionToken(rawToken),
    expiresAt,
    lastSeenAt: now,
  });
  return { id: String(created._id), expiresAt, cookieToken: rawToken };
}

export function applyGuestSessionCookie(response: NextResponse, issued: IssuedGuestSession): void {
  if (!issued.cookieToken) return;
  response.cookies.set(GUEST_SESSION_COOKIE_NAME, issued.cookieToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_SESSION_SECONDS,
    priority: 'high',
  });
}

export function clearGuestSessionCookie(response: NextResponse): void {
  response.cookies.set(GUEST_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function revokeGuestSession(request: NextRequest, now = new Date()): Promise<void> {
  const rawToken = request.cookies.get(GUEST_SESSION_COOKIE_NAME)?.value;
  if (!validCookieToken(rawToken)) return;
  await connectToMongo();
  await GuestSession.updateOne(
    { tokenHash: hashGuestSessionToken(rawToken), revokedAt: null },
    { $set: { revokedAt: now } },
  );
}
