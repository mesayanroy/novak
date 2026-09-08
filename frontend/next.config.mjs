/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@novak/sdk"],
  webpack: (config) => {
    // wagmi's Coinbase Smart Wallet connector (pulled in by "wagmi/connectors")
    // optionally depends on @coinbase/cdp-sdk's x402 payment support, which in
    // turn imports @x402/* packages we don't install and never exercise (the
    // demo only uses the injected connector). Stub them out rather than adding
    // unused dependencies.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;
