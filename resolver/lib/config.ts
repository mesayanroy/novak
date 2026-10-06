import type { Hex } from "viem";

/**
 * All resolver/keeper configuration, from env (see root .env.example).
 *
 * The resolver WRITES to the chain Novak is deployed on (Robinhood Chain
 * testnet 46630, or local anvil 31337) and READS source data from Robinhood
 * Chain MAINNET (Chainlink stock feeds and ERC-8056 stock tokens only exist
 * there — docs/ROBINHOOD_CHAIN_PLAN.md §0). Reads are free; no mainnet funds.
 */
export interface ResolverConfig {
  resolverId: string;
  chainId: number;
  rpcUrl: string;
  sourceRpcUrl: string;
  /** Ordered provider lists (explicit URL → Alchemy → public), used with a fallback transport. */
  rpcUrls: string[];
  sourceRpcUrls: string[];
  /** Alert when this node's ETH balance drops below this (0 = derive from the deployment's bonds). */
  minBalanceWei: bigint;
  /** Optional Slack/Discord-compatible webhook for low-balance alerts. */
  alertWebhookUrl?: string;
  privateKey: Hex;
  pollIntervalMs: number;
  /** Also run the keeper duties (finalize/expire/escalate/tryResolve/settle). Enable on ONE process. */
  keeper: boolean;
  /** Vote in dispute committees this resolver is drawn into (needs ETH for the tier bond). */
  voter: boolean;
  /** Serve /health and /evidence/:hash on this port (0 = off). */
  httpPort: number;
  logChunk: bigint;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ResolverConfig {
  const chainId = Number(env.NOVAK_CHAIN_ID ?? 46630);
  const raw = env.RESOLVER_PRIVATE_KEY?.trim();
  // Accept keys pasted with or without the 0x prefix.
  const privateKey = (raw && !raw.startsWith("0x") ? `0x${raw}` : raw) as Hex | undefined;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("RESOLVER_PRIVATE_KEY is missing or malformed (see .env.example)");
  }
  // ALCHEMY_API_KEY adds Alchemy (recommended: the public Robinhood RPCs are
  // rate-limited) in front of the public endpoints; an explicit URL wins.
  const alchemy = env.ALCHEMY_API_KEY?.trim();
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))];
  const rpcUrls =
    chainId === 31337
      ? [env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545"]
      : uniq([
          env.RPC_URL_ROBINHOOD_TESTNET,
          alchemy && `https://robinhood-testnet.g.alchemy.com/v2/${alchemy}`,
          "https://rpc.testnet.chain.robinhood.com",
        ]);
  const sourceRpcUrls = uniq([
    env.RESOLVER_SOURCE_RPC_URL,
    alchemy && `https://robinhood-mainnet.g.alchemy.com/v2/${alchemy}`,
    "https://rpc.mainnet.chain.robinhood.com",
  ]);
  const rpcUrl = rpcUrls[0];

  return {
    resolverId: env.RESOLVER_ID ?? "resolver",
    chainId,
    rpcUrl,
    sourceRpcUrl: sourceRpcUrls[0],
    rpcUrls,
    sourceRpcUrls,
    minBalanceWei: BigInt(env.RESOLVER_MIN_BALANCE_WEI ?? 0),
    alertWebhookUrl: env.RESOLVER_ALERT_WEBHOOK_URL || undefined,
    privateKey,
    pollIntervalMs: Number(env.RESOLVER_POLL_INTERVAL_MS ?? 15_000),
    keeper: env.RESOLVER_KEEPER === "true",
    voter: env.RESOLVER_VOTER !== "false",
    // Hosts like Render inject PORT; RESOLVER_HTTP_PORT wins when both are set.
    httpPort: Number(env.RESOLVER_HTTP_PORT ?? env.PORT ?? 0),
    logChunk: BigInt(env.RESOLVER_LOG_CHUNK ?? 500_000),
  };
}
