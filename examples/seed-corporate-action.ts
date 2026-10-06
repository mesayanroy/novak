/**
 * Adds one rh.corporate-action event — "any NVDA multiplier change in
 * [-WINDOW_BACK_DAYS, +7d]" — plus a StockLendingGuard rule that pauses NVDA
 * liquidations while it is true. With the default 40-day look-back it covers
 * NVDA's Sep 10 2026 dividend multiplier update, so resolvers can finalize it
 * TRUE immediately (handy after a fresh deploy, or when an older event's
 * window has rolled past the change).
 *
 *   NOVAK_CHAIN_ID=46630 DEPLOYER_PRIVATE_KEY=0x... pnpm tsx examples/seed-corporate-action.ts
 */
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  NovakClient,
  SOURCES,
  STOCK_TOKENS_MAINNET,
  encodeCorporateActionSpec,
  getDeployment,
  robinhood,
  robinhoodTestnet,
  sourceId,
  stockLendingGuardAbi,
  type Hex,
} from "../sdk/src/index.js";

const DAY = 86_400n;
const chainId = Number(process.env.NOVAK_CHAIN_ID ?? 46630);
const rpcUrl = process.env.RPC_URL_ROBINHOOD_TESTNET ?? "https://rpc.testnet.chain.robinhood.com";
const back = BigInt(process.env.WINDOW_BACK_DAYS ?? 40);
const disputeWindow = BigInt(process.env.SEED_DISPUTE_WINDOW_SECONDS ?? 1800);

async function main() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("Set DEPLOYER_PRIVATE_KEY (the deployer is the guard's risk admin)");
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  const d = getDeployment(chainId);
  const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http(rpcUrl) }) as PublicClient;
  const walletClient = createWalletClient({ account, chain: robinhoodTestnet, transport: http(rpcUrl) });
  const source = createPublicClient({
    chain: robinhood,
    transport: http(process.env.RESOLVER_SOURCE_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"),
  }) as PublicClient;
  const client = new NovakClient(publicClient, walletClient, d);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const sourceNow = (await source.getBlock()).timestamp;
  const id = await client.getCreatedEventId(
    await client.createEvent(
      {
        specVersion: 2,
        sourceId: sourceId(SOURCES.corporateAction),
        openTimestamp: now,
        observationDeadline: now + 8n * DAY,
        disputeWindowSeconds: disputeWindow,
        quorumThreshold: 2,
        spec: encodeCorporateActionSpec({
          stockToken: STOCK_TOKENS_MAINNET.NVDA,
          windowStart: sourceNow - back * DAY,
          windowEnd: sourceNow + 7n * DAY,
          minChangeBps: 0,
        }),
      },
      account,
    ),
  );
  console.log(`NVDA corporate action (-${back}d..+7d): ${id}`);

  const tx = await walletClient.writeContract({
    account,
    chain: robinhoodTestnet,
    address: d.stockLendingGuard,
    abi: stockLendingGuardAbi,
    functionName: "addRiskRule",
    args: [STOCK_TOKENS_MAINNET.NVDA, id, now, now + 7n * DAY, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  console.log("guard: NVDA liquidations paused while it is true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
