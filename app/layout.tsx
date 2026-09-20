import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import { Providers } from '@/app/providers';
import { JsonLd } from '@/components/JsonLd';
import { getSiteName, getSiteUrl } from '@/lib/siteConfig';

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

const siteUrl = getSiteUrl();
const siteName = getSiteName();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: `${siteName} | Menu and ordering`,
    template: `%s | ${siteName}`,
  },
  description: `Browse the current ${siteName} menu, place an order, and manage your customer account.`,
  keywords: ['food menu', 'restaurant ordering', siteName],
  authors: [{ name: siteName }],
  creator: siteName,
  openGraph: {
    title: `${siteName} — Menu and ordering`,
    description: `Browse the current ${siteName} menu and ordering options.`,
    type: 'website',
    locale: 'en_IN',
    url: siteUrl,
    siteName,
  },
  twitter: {
    card: 'summary',
    title: `${siteName} | Menu and ordering`,
    description: `Browse the current ${siteName} menu and ordering options.`,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#FF4500',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      data-scroll-behavior="smooth"
      className={`dark scroll-smooth ${poppins.variable} ${inter.variable}`}
    >
      <body className="bg-[#0a0a0a] text-white font-poppins antialiased">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Providers>
          <JsonLd />
          {children}
        </Providers>
      </body>
    </html>
  );
}
