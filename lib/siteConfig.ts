const LOCAL_FALLBACK = new URL('http://localhost:3000');

export function getSiteUrl(): URL {
  for (const candidate of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
        return new URL(url.origin);
      }
    } catch {
      // Invalid owner configuration is ignored and surfaced by health diagnostics.
    }
  }
  return LOCAL_FALLBACK;
}

export function isPublicSiteUrlConfigured(): boolean {
  if (!process.env.NEXT_PUBLIC_SITE_URL?.trim() && !process.env.NEXT_PUBLIC_APP_URL?.trim()) return false;
  return getSiteUrl().origin !== LOCAL_FALLBACK.origin || process.env.NODE_ENV !== 'production';
}

export function getSiteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME?.trim() || 'SHATVIKA CORNER';
}
