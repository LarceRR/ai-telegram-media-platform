/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript-built CJS; Next must transpile them.
  transpilePackages: ['@atmp/contracts'],
  eslint: {
    // Linting is one workspace-wide CI step, not a per-app build side effect.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
