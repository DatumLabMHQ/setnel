import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Hub lives in hub/ inside the setnel repo, which also has a lockfile at the repo root (the
// monitor). Next otherwise infers the repo root as the file-tracing root, so the Vercel function
// (whose root directory is hub/) ships with file paths relative to the wrong base and 500s at
// request time. Pin tracing to this directory so the traced paths match Vercel's root.
const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: here,
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
