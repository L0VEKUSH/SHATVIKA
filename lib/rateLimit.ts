import crypto from 'crypto';
import { isIP } from 'net';
import { connectToMongo } from '@/lib/mongoose';
import { RateLimitBucket } from '@/models/RateLimitBucket';

/**
 * RATE LIMITING MODULE
 *
 * The synchronous helper is a bounded, process-local sliding window retained
 * for low-risk callers and tests. Security-sensitive routes use the
 * Mongo-backed fixed-window implementation at the bottom of this module so
 * limits are shared across application instances.
 *
 * Algorithm: Sliding Window Counter
 * - Tracks request timestamps in a sliding window
 * - More accurate than fixed window (prevents burst at boundaries)
 * - Memory efficient for typical traffic
 */

interface RequestTimestamp {
  timestamps: number[];
  resetAt: number;
}

// In-memory store for rate limit tracking (sliding window)
const rateLimitStore: Map<string, RequestTimestamp> = new Map();
let lastCleanupAt = 0;

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

/**
 * Sliding Window Counter Algorithm
 * @param key - Unique identifier (IP, user ID, API key)
 * @param limit - Max requests allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns allowed, retryAfter, remaining
 */
function slidingWindowCounter(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  if (now - lastCleanupAt > 60_000) {
    for (const [storedKey, stored] of rateLimitStore) {
      if (stored.resetAt <= now) rateLimitStore.delete(storedKey);
    }
    lastCleanupAt = now;
  }
  const windowStart = now - windowMs;

  let entry = rateLimitStore.get(key);

  // Initialize or reset if window expired
  if (!entry || entry.resetAt <= now) {
    entry = { timestamps: [], resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
  }

  // Remove old timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if limit exceeded
  if (entry.timestamps.length >= limit) {
    const oldestTimestamp = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return {
      allowed: false,
      retryAfter: Math.max(1, retryAfter),
      remaining: 0,
    };
  }

  // Add current timestamp
  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.timestamps.length),
  };
}

/**
 * Check if a request from an IP should be rate limited
 * Uses sliding window counter algorithm for accuracy
 * @param ip - Client IP address
 * @param limit - Max requests allowed (default 5)
 * @param windowMs - Time window in milliseconds (default 60000 = 1 minute)
 * @returns allowed, retryAfter, remaining
 */
export function checkRateLimit(
  ip: string,
  limit: number = 5,
  windowMs: number = 60 * 1000
): RateLimitResult {
  return slidingWindowCounter(`rl:${ip}`, limit, windowMs);
}

/**
 * Extract client IP from request
 * Handles X-Forwarded-For header (for proxies) and direct connection
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUST_CF_CONNECTING_IP === 'true') {
    const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim() ?? '';
    if (isIP(cloudflareIp)) return cloudflareIp;
  }

  const trustedHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10);
  const forwarded = request.headers.get('x-forwarded-for');
  if (Number.isSafeInteger(trustedHops) && trustedHops > 0 && forwarded) {
    const chain = forwarded.split(',').map(value => value.trim()).filter(value => isIP(value));
    const candidate = chain[Math.max(0, chain.length - trustedHops)];
    if (candidate) return candidate;
  }

  // Do not trust caller-controlled forwarding headers unless the deployment's
  // proxy topology is explicitly configured.
  return process.env.NODE_ENV === 'production' ? 'proxy-ip-unconfigured' : '127.0.0.1';
}

/**
 * Alias for checkRateLimit with key-based (instead of IP-based) tracking
 * Useful for API keys, user IDs, or custom identifiers
 */
export function rateLimit(
  key: string,
  limit: number = 5,
  windowSec: number = 60
): RateLimitResult {
  return checkRateLimit(key, limit, windowSec * 1000);
}

/**
 * Mongo-backed fixed-window limiter shared by every application instance.
 * Keys are hashed before persistence; the TTL index removes expired buckets.
 */
export async function distributedRateLimit(
  key: string,
  limit: number = 5,
  windowSec: number = 60,
): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSec) || windowSec < 1) {
    throw new Error('INVALID_RATE_LIMIT_CONFIGURATION');
  }
  await connectToMongo();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date(resetAt + 60_000) },
  };
  let bucket;
  try {
    bucket = await RateLimitBucket.findOneAndUpdate(
      { keyHash, windowId },
      update,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
    bucket = await RateLimitBucket.findOneAndUpdate({ keyHash, windowId }, update, { returnDocument: 'after' }).lean();
  }
  if (!bucket) throw new Error('RATE_LIMIT_BACKEND_UNAVAILABLE');
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: allowed ? undefined : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
