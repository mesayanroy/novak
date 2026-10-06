import {
  connectorsForWallets,
  getWalletConnectConnector,
  type Wallet,
  type WalletDetailsParams,
} from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { createPublicClient, fallback, type Chain, type EIP1193Provider, type Transport } from "viem";
import { createConfig, createConnector, createStorage, http } from "wagmi";
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
 * MetaMask, found by its EIP-6963 identity (rdns "io.metamask") — NOT by
 * `window.ethereum`. With several extensions installed (Phantom, Rabby, OKX,
 * Coinbase, Brave…), `window.ethereum` belongs to whichever injected last, and
 * many of them set `isMetaMask: true`, so a plain injected connector opens the
 * wrong wallet. EIP-6963 announcements are unambiguous; the flag-based lookup
 * (which skips known impostors) is only a fallback for very old MetaMask.
 */
let announcedMetaMask: EIP1193Provider | undefined;
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", ((e: CustomEvent<{ info: { rdns: string }; provider: EIP1193Provider }>) => {
    if (e.detail?.info?.rdns === "io.metamask") announcedMetaMask = e.detail.provider;
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

type FlaggedProvider = EIP1193Provider & Record<string, unknown> & { providers?: FlaggedProvider[] };
const IMPOSTOR_FLAGS = [
  "isBraveWallet", "isPhantom", "isRabby", "isOkxWallet", "isOKExWallet", "isCoinbaseWallet", "isBitKeep",
  "isTokenPocket", "isTrust", "isTrustWallet", "isZerion", "isUniswapWallet", "isOpera", "isApexWallet",
  "isAvalanche", "isMathWallet", "isKuCoinWallet", "isPortal", "isTokenary", "isBackpack", "isExodus",
];

/**
 * The genuine MetaMask extension, or nothing:
 *  1. its EIP-6963 announcement (rdns "io.metamask"), which is what MetaMask
 *     itself publishes and other wallets can't claim without lying about rdns;
 *  2. for MetaMask builds older than EIP-6963, an injected provider that has
 *     `isMetaMask` AND MetaMask's private `_metamask` API, and none of the
 *     flags other wallets set when they impersonate it.
 */
export function findMetaMaskProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  if (announcedMetaMask) return announcedMetaMask;
  const eth = (window as { ethereum?: FlaggedProvider }).ethereum;
  const candidates = eth?.providers?.length ? eth.providers : eth ? [eth] : [];
  return candidates.find((p) => p.isMetaMask && typeof p._metamask === "object" && !IMPOSTOR_FLAGS.some((f) => p[f]));
}

const METAMASK_CONNECTOR_ID = "io.metamask";

/**
 * RainbowKit's official MetaMask wallet (official icon, rdns, install links and
 * instructions). Only the connector is ours: it binds to the provider
 * `findMetaMaskProvider` returns, so another extension that sets
 * `isMetaMask: true` on window.ethereum can never answer instead. Without the
 * extension: the official install flow, plus MetaMask Mobile over
 * WalletConnect once a project ID is configured.
 */
const metaMask = (params: Parameters<typeof metaMaskWallet>[0]): Wallet => {
  const official = metaMaskWallet(params);
  const installed = typeof window !== "undefined" ? Boolean(findMetaMaskProvider()) : undefined;
  if (!installed && walletConnectConfigured) return official;
  return {
    ...official,
    installed,
    qrCode: undefined,
    mobile: undefined,
    createConnector: (walletDetails: WalletDetailsParams) =>
      createConnector((config) => ({
        ...injected({
          target: { id: METAMASK_CONNECTOR_ID, name: "MetaMask", provider: () => findMetaMaskProvider() as never },
        })(config),
        ...walletDetails,
      })),
  };
};

// MetaMask is the ONLY browser wallet offered. Two wagmi/RainbowKit defaults
// are what kept opening Phantom: (1) EIP-6963 multi-injected discovery lists
// every installed extension (Phantom included) under "Installed"/"Recent",
// and (2) RainbowKit's generic "Browser Wallet" uses window.ethereum, which
// Phantom/Rabby/OKX hijack. Both are off. Robinhood Wallet (WalletConnect) is
// added only once NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set — without a real
// ID the relay throws "Connection interrupted while trying to subscribe".
const connectors = connectorsForWallets(
  [
    {
      groupName: "Connect to Robinhood Chain",
      wallets: walletConnectConfigured ? [metaMask, robinhoodWallet] : [metaMask],
    },
  ],
  { appName: "Novak", projectId: projectId || "unset" },
);

// Robinhood Chain docs (docs.robinhood.com/chain/connecting): the public
// RPC is "rate-limited and not recommended for production use" — Alchemy is
// the recommended provider. Testnet URL only, by construction, regardless of
// what NEXT_PUBLIC_CHAIN_ID is set to: activeChain above never resolves to
// Robinhood Chain mainnet, so this key is never used against it.
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const publicRpc = process.env.NEXT_PUBLIC_RPC_URL ?? activeChain.rpcUrls.default.http[0];
const alchemyRpc = activeChain.id === robinhoodTestnet.id && alchemyKey ? `https://robinhood-testnet.g.alchemy.com/v2/${alchemyKey}` : undefined;

/**
 * Reads go to Alchemy first (public RPC as backup). Log scans (events list,
 * timelines, trade history) go to the public RPC first: Alchemy's free tier
 * caps eth_getLogs at a 10-block range.
 */
const rpcTransport: Transport = alchemyRpc
  ? (opts) => {
      const main = fallback([http(alchemyRpc), http(publicRpc)])(opts);
      const logs = fallback([http(publicRpc), http(alchemyRpc)])(opts);
      const request = ((args: { method: string }, o?: unknown) =>
        args.method === "eth_getLogs" ? (logs.request as (a: unknown, o?: unknown) => unknown)(args, o) : (main.request as (a: unknown, o?: unknown) => unknown)(args, o)) as typeof main.request;
      return { ...main, request };
    }
  : http(publicRpc);

export const wagmiConfig = createConfig({
  connectors,
  // Don't auto-add every EIP-6963 wallet (Phantom, Rabby, …) as a connector.
  multiInjectedProviderDiscovery: false,
  chains: [activeChain] as [Chain],
  // The chain has Multicall3 deployed — batch concurrent readContract calls
  // into a single eth_call instead of one RPC round trip each (the RPC has
  // noticeable per-request latency, so this materially speeds up event/
  // market loading, which fires several reads per item).
  client: ({ chain }) => createPublicClient({ chain, transport: rpcTransport, batch: { multicall: true } }),
  ssr: true,
  // Fresh storage key: drops any stale "recent"/auto-reconnect connector
  // (e.g. a different browser wallet) remembered by earlier builds.
  storage: createStorage({ key: "novak.wallet.v4", storage: typeof window !== "undefined" ? window.localStorage : undefined }),
});

export { activeChain };
