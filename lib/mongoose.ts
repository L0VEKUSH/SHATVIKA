import mongoose from 'mongoose';

/* ─────────────────────────────────────────────────────────────────
   Connection cache — shared across Next.js hot-reloads in dev
   and reused across invocations in serverless production.
───────────────────────────────────────────────────────────────── */
declare global {
  // eslint-disable-next-line no-var
  var __mongoose_cache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

const cache = globalThis.__mongoose_cache ?? { conn: null, promise: null };

// Persist the cache object in globalThis so dev hot-reloads reuse it
if (!globalThis.__mongoose_cache) {
  globalThis.__mongoose_cache = cache;
}

export async function connectToMongo(): Promise<typeof mongoose> {
  // ── 1. Validate env ──────────────────────────────────────────
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      '[connectToMongo] MONGODB_URI is not set.\n' +
      'Add it to your .env.local file and restart the dev server.'
    );
  }

  // ── 2. Return cached connection ──────────────────────────────
  if (cache.conn) return cache.conn;

  // ── 3. Create new connection (only once) ────────────────────
  if (!cache.promise) {
    const dbName = process.env.MONGODB_DB ?? 'SHATVIKA';

    cache.promise = mongoose
      .connect(uri, {
        dbName,
        bufferCommands: false,      // Fail fast — don't silently queue commands
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      })
      .then((m) => {
        console.log(`[mongoose] Connected → db: ${dbName}`);
        cache.conn = m;
        return m;
      })
      .catch((err: Error) => {
        cache.promise = null;       // Allow retry on next call
        console.error('[mongoose] Connection error:', err.message);
        throw err;
      });
  }

  return cache.promise;
}
