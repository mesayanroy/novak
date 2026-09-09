import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { foundry } from "wagmi/chains";

/**
 * MVP chain list: local Anvil only (chain id 31337), matching what's
 * actually deployed today (script/Deploy.s.sol run against local anvil —
 * see .env.local / docs/SPEC_AND_TASKS.md Issue #20 for why no testnet
 * deployment exists yet). Add Sepolia here once that issue is closed.
 *
 * getDefaultConfig() wires RainbowKit's default connector set (injected/
 * MetaMask, WalletConnect, Coinbase Wallet, Rainbow Wallet, plus a handful
 * more) — WalletConnect needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to
 * actually connect; every other connector works without it.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Novak",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "novak-local-dev",
  chains: [foundry],
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
  },
  ssr: true,
});
