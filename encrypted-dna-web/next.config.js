/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { appDir: true },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // @solana/web3.js and @arcium-hq/client reference Node.js built-ins.
    // Set them to false so webpack provides empty shims — the browser's
    // native crypto (SubtleCrypto / getRandomValues) still works normally.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
