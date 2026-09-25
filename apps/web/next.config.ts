import path from 'node:path';
import type { NextConfig } from 'next';

// The browser only ever talks to this Next.js origin; /api/* is proxied to the NestJS API.
// That keeps the session cookie first-party (no cross-site cookie/CORS headaches) in every environment.
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace dependencies from the repo root so hoisted node_modules land in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
