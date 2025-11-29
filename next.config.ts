/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // redirects や rewrites は一旦全部なし
  async redirects() {
    return [];
  },
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
