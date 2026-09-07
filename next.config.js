/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  // Ensure server-only modules (mongoose, crypto) are not bundled for the browser
  serverExternalPackages: ['mongoose'],

  // Disable X-Powered-By header for security
  poweredByHeader: false,

  // Strict mode
  reactStrictMode: true,
};

module.exports = nextConfig;
