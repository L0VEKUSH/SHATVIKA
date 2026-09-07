import type { Metadata, Viewport } from 'next';
import { Poppins, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/app/providers';
import { JsonLd } from '@/components/JsonLd';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shatvikcorner.in';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Shatvika Corner | Fast. Fresh. Delicious.',
    template: '%s | Shatvika Corner',
  },
  description:
    'Premium fast food crafted with passion. Flame-grilled burgers, stone-baked pizzas, handmade shakes and more — delivered in under 30 minutes in Aligarh.',
  keywords: [
    'fast food',
    'burgers',
    'pizza',
    'delivery',
    'Aligarh',
    'Shatvika Corner',
    'flame grilled',
  ],
  authors: [{ name: 'Shatvika Corner' }],
  creator: 'Shatvika Corner',
  openGraph: {
    title: 'Shatvika Corner — Premium Fast Food',
    description: 'Fast. Fresh. Delicious. Order now and get it in under 30 minutes.',
    type: 'website',
    locale: 'en_IN',
    url: siteUrl,
    siteName: 'Shatvika Corner',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shatvika Corner | Fast. Fresh. Delicious.',
    description: 'Premium fast food delivered hot to your door.',
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteUrl,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#FF4500',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark scroll-smooth ${poppins.variable} ${inter.variable}`}>
      <body className="bg-[#0a0a0a] text-white font-poppins antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Providers>
          <JsonLd />
          {children}
        </Providers>
      </body>
    </html>
  );
}
