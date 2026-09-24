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
  const privateKey = env.RESOLVER_PRIVATE_KEY as Hex | undefined;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("RESOLVER_PRIVATE_KEY is missing or malformed (see .env.example)");
  }
  const rpcUrl =
    chainId === 31337
      ? (env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545")
      : (env.RPC_URL_ROBINHOOD_TESTNET ?? "https://rpc.testnet.chain.robinhood.com");

  return {
    resolverId: env.RESOLVER_ID ?? "resolver",
    chainId,
    rpcUrl,
    sourceRpcUrl: env.RESOLVER_SOURCE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
    privateKey,
    pollIntervalMs: Number(env.RESOLVER_POLL_INTERVAL_MS ?? 15_000),
    keeper: env.RESOLVER_KEEPER === "true",
    voter: env.RESOLVER_VOTER !== "false",
    httpPort: Number(env.RESOLVER_HTTP_PORT ?? 0),
    logChunk: BigInt(env.RESOLVER_LOG_CHUNK ?? 500_000),
  };
}
