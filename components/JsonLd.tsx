const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shatvikcorner.in';

export function JsonLd() {
  const restaurant = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'Shatvika Corner',
    description:
      'Premium fast food restaurant serving flame-grilled burgers, stone-baked  s, and handcrafted sides in Aligarh.',
    url: siteUrl,
    telephone: '+91-9876543210',
    email: 'hello@shatvikcorner.in',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Quarshi Chauraha',
      addressLocality: 'Aligarh',
      postalCode: '202001',
      addressCountry: 'IN',
    },
    servesCuisine: ['Fast Food', 'Burgers', ' '],
    priceRange: '₹₹',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '10:00',
        closes: '00:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday', 'Sunday'],
        opens: '09:00',
        closes: '01:00',
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurant) }}
    />
  );
}
