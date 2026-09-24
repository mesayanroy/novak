import { connectorsForWallets, getWalletConnectConnector, type Wallet } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { Chain } from "viem";
import { createConfig, http } from "wagmi";
import { foundry, robinhoodTestnet } from "wagmi/chains";
import { NOVAK_CHAIN_ID } from "./addresses";

/**
 * Chains: Robinhood Chain testnet (46630) — where Novak is deployed — plus
 * local anvil when NEXT_PUBLIC_CHAIN_ID=31337.
 *
 * WalletConnect REQUIRES a real project ID (https://cloud.reown.com) in
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Robinhood Wallet connects to dapps
 * over WalletConnect and supports Robinhood Chain natively, so without that
 * ID the recommended wallet cannot connect.
 */
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
export const walletConnectConfigured = projectId.length > 0;

const activeChain: Chain = NOVAK_CHAIN_ID === foundry.id ? foundry : robinhoodTestnet;

/** Robinhood Wallet via WalletConnect (QR on desktop, deep link on mobile).
 *  Generic wallet glyph — we integrate with the wallet, we don't use its brand. */
const robinhoodWallet = (): Wallet => ({
  id: "robinhood-wallet",
  name: "Robinhood Wallet",
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0A0908"/><path d="M5 8.5h14v9H5z" fill="none" stroke="#fdfdfc" stroke-width="1.6"/><path d="M5 8.5l2-3h10l2 3" fill="none" stroke="#fdfdfc" stroke-width="1.6"/><circle cx="15.5" cy="13" r="1.3" fill="#fdfdfc"/></svg>',
    ),
  iconBackground: "#0A0908",
  qrCode: { getUri: (uri: string) => uri },
  mobile: { getUri: (uri: string) => uri },
  createConnector: getWalletConnectConnector({ projectId: projectId || "unset" }),
});

// Without a real project ID, NO WalletConnect-backed connector may be
// created: the relay rejects the connection and throws "Connection
// interrupted while trying to subscribe". RainbowKit's metaMaskWallet /
// coinbaseWallet fall back to WalletConnect when the extension isn't
// detected (always the case during SSR), so the unconfigured set is the
// plain injected connector — which still picks up MetaMask in the browser.
const connectors = connectorsForWallets(
  walletConnectConfigured
    ? [
        {
          groupName: "Recommended for Robinhood Chain",
          wallets: [robinhoodWallet, metaMaskWallet, coinbaseWallet],
        },
        { groupName: "Other", wallets: [walletConnectWallet, injectedWallet] },
      ]
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName: "Novak", projectId: projectId || "unset" },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [activeChain] as [Chain],
  transports: {
    [activeChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0]),
  },
  ssr: true,
});

export { activeChain };
