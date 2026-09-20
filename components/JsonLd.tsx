import { getSiteName, getSiteUrl } from '@/lib/siteConfig';

function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function JsonLd() {
  const phone = process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim();
  const email = process.env.NEXT_PUBLIC_BUSINESS_EMAIL?.trim();
  const address = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim();
  const instagram = safeHttpsUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL);
  const restaurant = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: getSiteName(),
    description: 'Menu and ordering services.',
    url: getSiteUrl().toString(),
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    ...(address ? { address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'IN' } } : {}),
    ...(instagram ? { sameAs: [instagram] } : {}),
  };
  // Escaping '<' prevents owner-supplied configuration from terminating the script element.
  const serialized = JSON.stringify(restaurant).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}
