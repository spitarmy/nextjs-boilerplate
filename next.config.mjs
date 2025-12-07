/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router (/app ディレクトリ) を使う設定
  experimental: {
    appDir: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
