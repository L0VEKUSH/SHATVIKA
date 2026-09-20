/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  // Ensure server-only modules (mongoose, crypto) are not bundled for the browser
  serverExternalPackages: ['mongoose', '@expo-google-fonts/noto-sans-devanagari'],

  // This repository lives below another user-level lockfile on the current
  // workstation. Keep build tracing scoped to this application directory.
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/api/admin/reports': [
      './node_modules/@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf',
    ],
  },

  // Disable X-Powered-By header for security
  poweredByHeader: false,

  // Strict mode
  reactStrictMode: true,
};

module.exports = nextConfig;
