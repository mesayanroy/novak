/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@novak/sdk"],
  webpack: (config) => {
    // wagmi's Coinbase Smart Wallet connector (pulled in by "wagmi/connectors")
    // optionally depends on @coinbase/cdp-sdk's x402 payment support, which in
    // turn imports @x402/* packages we don't install and never exercise.
    // RainbowKit's default connector set (MetaMask + WalletConnect) similarly
    // pulls in a React Native storage adapter and a pretty-printer for a
    // server-side logger, neither ever exercised in a browser/Next.js build.
    // Stub all of them out rather than adding unused dependencies.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/svm/exact/client": false,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
