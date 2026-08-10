/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript-built CJS; Next must transpile them.
  transpilePackages: ['@atmp/contracts'],
};

export default nextConfig;
