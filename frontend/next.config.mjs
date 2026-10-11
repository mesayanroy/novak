import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker builds set NEXT_OUTPUT=standalone: a self-contained server.js with
  // only the files it needs (see /Dockerfile). Vercel and `next dev` ignore it.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? {
        output: "standalone",
        // pnpm workspace: trace dependencies from the repo root (the SDK lives there).
        experimental: { outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "..") },
      }
    : {}),
  // Lets a production build run beside `next dev` without clobbering .next/.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@novakoracle/sdk"],
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
