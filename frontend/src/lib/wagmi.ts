import {
  connectorsForWallets,
  getWalletConnectConnector,
  type Wallet,
  type WalletDetailsParams,
} from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createPublicClient, type Chain } from "viem";
import { createConfig, createConnector, http } from "wagmi";
import { injected } from "wagmi/connectors";
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

/**
 * MetaMask via the browser extension ONLY (wagmi's injected connector,
 * targeted at MetaMask). RainbowKit's stock `metaMaskWallet` falls back to a
 * WalletConnect connector whenever it doesn't detect the extension — which is
 * always the case at module load during SSR — so without a WalletConnect
 * project ID it either disappears or fails. This one never touches
 * WalletConnect, so MetaMask is always offered and always connects directly.
 */
const metaMaskExtension = (): Wallet => ({
  id: "metamask-extension",
  name: "MetaMask",
  rdns: "io.metamask",
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#F6851B"/><path d="M5.5 6l5.2 3.9-1-2.3zm13 0l-4.2 1.6-1 2.3zM7 15.6l1 2.8 2.6.7-.4-2.1zm10 0l-3.2 1.4-.4 2.1 2.6-.7zm-6.4-4.3L9.3 13l3 .2-.1-3.2zm2.8 0l-1.6-1.3-.1 3.2 3-.2z" fill="#fff"/></svg>',
    ),
  iconBackground: "#ffffff",
  installed: typeof window !== "undefined" ? Boolean((window as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask) : undefined,
  downloadUrls: { browserExtension: "https://metamask.io/download/" },
  createConnector: (walletDetails: WalletDetailsParams) =>
    createConnector((config) => ({ ...injected({ target: "metaMask" })(config), ...walletDetails })),
});

// Without a real project ID, NO WalletConnect-backed connector may be
// created: the relay rejects the connection and throws "Connection
// interrupted while trying to subscribe". So: MetaMask (extension) and any
// other injected browser wallet always; Robinhood Wallet + WalletConnect only
// once NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
const connectors = connectorsForWallets(
  walletConnectConfigured
    ? [
        {
          groupName: "Recommended for Robinhood Chain",
          wallets: [metaMaskExtension, robinhoodWallet, coinbaseWallet],
        },
        { groupName: "Other", wallets: [walletConnectWallet, injectedWallet] },
      ]
    : [{ groupName: "Browser wallets", wallets: [metaMaskExtension, injectedWallet] }],
  { appName: "Novak", projectId: projectId || "unset" },
);

// Robinhood Chain docs (docs.robinhood.com/chain/connecting): the public
// RPC is "rate-limited and not recommended for production use" — Alchemy is
// the recommended provider. Testnet URL only, by construction, regardless of
// what NEXT_PUBLIC_CHAIN_ID is set to: activeChain above never resolves to
// Robinhood Chain mainnet, so this key is never used against it.
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const rpcUrl =
  activeChain.id === robinhoodTestnet.id && alchemyKey
    ? `https://robinhood-testnet.g.alchemy.com/v2/${alchemyKey}`
    : process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0];

export const wagmiConfig = createConfig({
  connectors,
  chains: [activeChain] as [Chain],
  // The chain has Multicall3 deployed — batch concurrent readContract calls
  // into a single eth_call instead of one RPC round trip each (the RPC has
  // noticeable per-request latency, so this materially speeds up event/
  // market loading, which fires several reads per item).
  client: ({ chain }) => createPublicClient({ chain, transport: http(rpcUrl), batch: { multicall: true } }),
  ssr: true,
});

export { activeChain };
