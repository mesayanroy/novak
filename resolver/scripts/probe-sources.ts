/**
 * Runs every adapter against LIVE sources (Robinhood Chain mainnet +
 * Robinhood's asset API) without touching any Novak deployment — a quick way
 * to see exactly what a resolver would vote right now.
 *
 *   pnpm --filter novak-resolver probe
 */
import { createPublicClient, http, type PublicClient } from "viem";
import {
  CHAINLINK_FEEDS_MAINNET,
  Comparator,
  STOCK_TOKENS_MAINNET,
  TradingSession,
  encodeCorporateActionSpec,
  encodePriceAtSpec,
  encodeTradingStatusSpec,
  robinhood,
  type EventSpecInput,
} from "@novak/sdk";
import { ChainlinkPriceAtAdapter } from "../adapters/chainlinkPriceAt.js";
import { CorporateActionAdapter } from "../adapters/corporateAction.js";
import { TradingStatusAdapter } from "../adapters/tradingStatus.js";
import { toJson } from "../lib/chain.js";

const source = createPublicClient({
  chain: robinhood,
  transport: http(process.env.RESOLVER_SOURCE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"),
}) as PublicClient;

const spec = (specVersion: number, bytes: `0x${string}`): EventSpecInput => ({
  specVersion,
  sourceId: "0x00",
  openTimestamp: 0n,
  observationDeadline: 0n,
  disputeWindowSeconds: 0n,
  quorumThreshold: 1,
  spec: bytes,
});

async function main() {
  const now = (await source.getBlock()).timestamp;
  const run = async (label: string, p: Promise<unknown>) => console.log(`\n${label}\n  ${toJson(await p)}`);

  await run(
    "chainlink.price-at: NVDA >= $200 as of 1h ago (24h max staleness)",
    new ChainlinkPriceAtAdapter(source).observe({
      eventId: "0x01",
      now,
      spec: spec(
        2,
        encodePriceAtSpec({
          feed: CHAINLINK_FEEDS_MAINNET.NVDA,
          threshold: 200_0000_0000n,
          comparator: Comparator.Gte,
          at: now - 3600n,
          maxStaleness: 86_400n,
        }),
      ),
    }),
  );

  await run(
    "rh.corporate-action: any NVDA multiplier change effective Sep 9-11 2026 (the real dividend update)",
    new CorporateActionAdapter(source).observe({
      eventId: "0x02",
      now,
      spec: spec(
        2,
        encodeCorporateActionSpec({
          stockToken: STOCK_TOKENS_MAINNET.NVDA,
          windowStart: 1_788_912_000n,
          windowEnd: 1_789_084_800n,
          minChangeBps: 0,
        }),
      ),
    }),
  );

  await run(
    "rh.trading-status: is NVDA NOT tradable in the overnight session right now?",
    new TradingStatusAdapter().observe({
      eventId: "0x03",
      now,
      spec: spec(1, encodeTradingStatusSpec({ symbol: "NVDA", session: TradingSession.Overnight })),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
