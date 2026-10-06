/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['firebase-admin', 'sharp', 'pdfkit'],
  outputFileTracingIncludes: { '/api/reports/export': ['./src/assets/fonts/*.ttf', './node_modules/pdfkit/js/data/**/*'] },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      }
    ];
  }
};

export default nextConfig;
