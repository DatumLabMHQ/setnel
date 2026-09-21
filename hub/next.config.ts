import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lint runs as its own step (`npm run lint`), not inside the production build, so a legacy
  // lint nit never blocks a deploy. Types are still checked on every build.
  eslint: { ignoreDuringBuilds: true },
  // The Hub is an internal tool — don't index it.
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
