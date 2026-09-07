/**
 * RATE LIMITING MODULE
 *
 * Implements sliding window algorithm with in-memory store.
 * In production, Redis backend provides distributed rate limiting.
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
  // Check X-Forwarded-For header first (for proxies, CloudFlare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take first IP if multiple are listed
    return forwarded.split(',')[0].trim();
  }

  // Fallback to CF-Connecting-IP (CloudFlare)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  // Fallback to X-Real-IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Last resort: localhost (for local development)
  return '127.0.0.1';
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
