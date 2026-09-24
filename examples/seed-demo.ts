/**
 * Seeds a Novak deployment with the Robinhood Chain demo set, using LIVE
 * mainnet prices to pick realistic thresholds:
 *
 *   A  chainlink.price-at  "NVDA >= $<now, rounded> at T"            (v2)
 *   B  chainlink.price-at  "TSLA <= $<now, rounded> at T"            (v2)
 *   AB AND(A, B) composite
 *   C  rh.corporate-action "any NVDA multiplier change in [-20d, +7d]" (v2) — true already (Sep 10 2026 dividend update)
 *   D  rh.trading-status   "NVDA NOT tradable overnight, now"          (v1)
 *   Markets on A, B and AB (trading closes at T); a StockLendingGuard rule
 *   pausing NVDA liquidations while C is true.
 *
 * T = now + SEED_OPEN_DELAY_SECONDS (default 600). Resolvers (with the keeper)
 * then resolve everything on their own.
 *
 *   NOVAK_CHAIN_ID=46630 DEPLOYER_PRIVATE_KEY=0x... pnpm tsx examples/seed-demo.ts
 */
import { createPublicClient, createWalletClient, http, parseAbi, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAINLINK_FEEDS_MAINNET,
  Comparator,
  CompositeOp,
  NovakClient,
  SOURCES,
  STOCK_TOKENS_MAINNET,
  TradingSession,
  encodeCorporateActionSpec,
  encodePriceAtSpec,
  encodeTradingStatusSpec,
  foundry,
  getDeployment,
  robinhood,
  robinhoodTestnet,
  sourceId,
  stockLendingGuardAbi,
  type EventSpecInput,
  type Hex,
} from "../sdk/src/index.js";

const chainId = Number(process.env.NOVAK_CHAIN_ID ?? 46630);
const chain = chainId === foundry.id ? foundry : robinhoodTestnet;
const rpcUrl =
  chainId === foundry.id
    ? (process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545")
    : (process.env.RPC_URL_ROBINHOOD_TESTNET ?? "https://rpc.testnet.chain.robinhood.com");
const delay = BigInt(process.env.SEED_OPEN_DELAY_SECONDS ?? 600);
const HOUR = 3600n;
const DAY = 24n * HOUR;

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("Set DEPLOYER_PRIVATE_KEY (the deployer is also the guard's risk admin)");
  const account = privateKeyToAccount(key);
  const d = getDeployment(chainId);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const source = createPublicClient({
    chain: robinhood,
    transport: http(process.env.RESOLVER_SOURCE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"),
  }) as PublicClient;
  const client = new NovakClient(publicClient, walletClient, d);
  const wait = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

  // Protocol times use the deployment chain's clock; price-at `at` uses the
  // SOURCE (mainnet) clock — they differ on a fast-forwarded anvil.
  const chainNow = (await publicClient.getBlock()).timestamp;
  const wallNow = BigInt(Math.floor(Date.now() / 1000));
  const protoNow = chainNow > wallNow ? chainNow : wallNow;
  const sourceNow = (await source.getBlock()).timestamp;
  const T = protoNow + delay;
  const at = sourceNow + delay;

  const price = async (feed: Hex) => {
    const [, answer] = await source.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" });
    return (answer / 100_000_000n) * 100_000_000n; // round down to whole dollars (8 decimals)
  };
  const nvda = await price(CHAINLINK_FEEDS_MAINNET.NVDA);
  const tsla = await price(CHAINLINK_FEEDS_MAINNET.TSLA);

  const create = async (label: string, e: Omit<EventSpecInput, "disputeWindowSeconds" | "quorumThreshold">) => {
    const id = await client.getCreatedEventId(
      await client.createEvent({ ...e, disputeWindowSeconds: 120n, quorumThreshold: 2 }, account),
    );
    console.log(`${label}: ${id}`);
    return id;
  };

  const priceEvent = (label: string, feed: Hex, threshold: bigint, comparator: Comparator) =>
    create(label, {
      specVersion: 2,
      sourceId: sourceId(SOURCES.priceAt),
      openTimestamp: T,
      observationDeadline: T + DAY,
      spec: encodePriceAtSpec({ feed, threshold, comparator, at, maxStaleness: 3n * DAY }),
    });

  const a = await priceEvent(`A  NVDA >= $${nvda / 100_000_000n}`, CHAINLINK_FEEDS_MAINNET.NVDA, nvda, Comparator.Gte);
  const b = await priceEvent(`B  TSLA <= $${tsla / 100_000_000n}`, CHAINLINK_FEEDS_MAINNET.TSLA, tsla, Comparator.Lte);

  const abTx = await client.createComposite({ op: CompositeOp.And, operands: [a, b], window: 0n }, account);
  const abLog = (await wait(abTx)).logs.find((l) => l.address.toLowerCase() === d.eventComposer.toLowerCase());
  const ab = abLog!.topics[1] as Hex;
  console.log(`AB AND(A,B): ${ab}`);

  const c = await create("C  NVDA corporate action (any multiplier change, -20d..+7d)", {
    specVersion: 2,
    sourceId: sourceId(SOURCES.corporateAction),
    openTimestamp: protoNow,
    observationDeadline: protoNow + 8n * DAY,
    spec: encodeCorporateActionSpec({
      stockToken: STOCK_TOKENS_MAINNET.NVDA,
      windowStart: sourceNow - 20n * DAY,
      windowEnd: sourceNow + 7n * DAY,
      minChangeBps: 0,
    }),
  });

  await create("D  NVDA not tradable overnight (snapshot)", {
    specVersion: 1,
    sourceId: sourceId(SOURCES.tradingStatus),
    openTimestamp: protoNow,
    observationDeadline: protoNow + 15n * 60n,
    spec: encodeTradingStatusSpec({ symbol: "NVDA", session: TradingSession.Overnight }),
  });

  for (const [eventId, q] of [
    [a, `Will NVDA be >= $${nvda / 100_000_000n} at the bell?`],
    [b, `Will TSLA be <= $${tsla / 100_000_000n} at the bell?`],
    [ab, "NVDA up AND TSLA down?"],
  ] as const) {
    const marketId = await client.getCreatedMarketId(await client.createMarket(eventId, T, q, account));
    console.log(`market "${q}": ${marketId}`);
  }

  await wait(
    await walletClient.writeContract({
      account,
      chain,
      address: d.stockLendingGuard,
      abi: stockLendingGuardAbi,
      functionName: "addRiskRule",
      args: [STOCK_TOKENS_MAINNET.NVDA, c, protoNow, protoNow + 7n * DAY, true],
    }),
  );
  console.log(`guard: NVDA liquidations paused while C is true (fail-closed until resolved)`);
  console.log(`\nobservation opens at T=${T} (in ${delay}s); resolvers + keeper take it from here.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
