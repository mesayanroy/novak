import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { robinhood } from "viem/chains";

/**
 * Read-only client for Robinhood Chain MAINNET (Chainlink feeds, stock tokens),
 * used by the /api routes. Order: an explicit RESOLVER_SOURCE_RPC_URL, then
 * Alchemy (ALCHEMY_API_KEY, or the public NEXT_PUBLIC_ALCHEMY_API_KEY), then
 * the public endpoint, which sits behind Cloudflare and starts answering 403
 * challenges under load. Every request has a timeout so a slow provider falls
 * through instead of hanging a page.
 */
let client: PublicClient | undefined;

export function mainnetClient(): PublicClient {
  if (client) return client;
  const key = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const urls = [
    process.env.RESOLVER_SOURCE_RPC_URL,
    key ? `https://robinhood-mainnet.g.alchemy.com/v2/${key}` : undefined,
    robinhood.rpcUrls.default.http[0],
  ].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i);
  client = createPublicClient({
    chain: robinhood,
    transport: fallback(urls.map((u) => http(u, { timeout: 10_000, retryCount: 1 }))),
    batch: { multicall: true },
  }) as PublicClient;
  return client;
}
