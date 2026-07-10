/**
 * lib/env.ts
 * Central environment variable validator.
 * Import this at the top of any server module that needs these variables.
 * Throws a descriptive error at start-up if a required variable is missing.
 */

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `[env] Missing required environment variable: ${name}\n` +
      `Copy .env.example → .env.local and fill in all values.`
    );
  }
  return val;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  /** MongoDB Atlas connection string */
  MONGODB_URI: required('MONGODB_URI'),

  /** Database name inside the Atlas cluster */
  MONGODB_DB: optional('MONGODB_DB', 'SHATVIKA'),

  /** HS256 secret used to sign admin JWT sessions */
  ADMIN_JWT_SECRET: optional('ADMIN_JWT_SECRET', ''),

  /** Admin credentials */
  ADMIN_EMAIL: optional('ADMIN_EMAIL', ''),
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD', ''),

  /** Public-facing app URL (used for SEO / sitemap) */
  NEXT_PUBLIC_APP_URL: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

  /** Branding */
  NEXT_PUBLIC_SITE_NAME: optional('NEXT_PUBLIC_SITE_NAME', 'Shatvika Corner'),

  NODE_ENV: optional('NODE_ENV', 'development'),
} as const;
