/**
 * Canonical Novak flow, fully wired end-to-end against a local anvil chain,
 * in the order a real Robinhood Chain market runs:
 *
 *   1. Create two primitive specVersion-2 events whose observation windows
 *      open in 60s (Registry).
 *   2. Compose WITHIN(48h) over them (Composer) — composites can be defined
 *      before their operands resolve.
 *   3. Open a USDG market on the composite; trading closes when observation
 *      opens. Two traders mint test USDG, approve, and take opposite sides.
 *   4. Window opens: two authorized resolvers submit matching observations
 *      (outcome + occurredAt), reaching quorum.
 *   5. Dispute window elapses -> finalize both, resolve the composite.
 *   6. Settle the market (1% fee to treasury) and claim.
 *
 * Run:
 *   1. anvil
 *   2. RESOLVER_ADDRESSES=0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
 *        forge script script/Deploy.s.sol --rpc-url local --broadcast
 *   3. node script/export-deployment.mjs 31337 && pnpm --filter @novakoracle/sdk gen
 *   4. pnpm example:e2e
 *
 * The keys below are anvil's well-known, publicly documented default test
 * keys (the "test test test ... junk" mnemonic). They are NOT secret and must
 * NEVER be used for anything but a local anvil chain.
 */
import { createPublicClient, createTestClient, createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  NovakClient,
  CompositeOp,
  eventRegistryAbi,
  decodeOutcome,
  encodeOutcomeV2,
  getDeployment,
  sourceId,
} from "../sdk/src/index.js";

const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const; // #0
const RESOLVER_A_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // #1
const RESOLVER_B_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const; // #2
const COUNTERPARTY_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as const; // #3

const USDG = (n: number) => BigInt(n) * 1_000_000n; // 6 decimals

async function main() {
  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const addresses = getDeployment(foundry.id);

  const owner = privateKeyToAccount((process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) ?? OWNER_KEY);
  const resolvers = [privateKeyToAccount(RESOLVER_A_KEY), privateKeyToAccount(RESOLVER_B_KEY)];
  const counterparty = privateKeyToAccount(COUNTERPARTY_KEY);

  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const wallet = (account: typeof owner) => createWalletClient({ account, chain: foundry, transport: http(rpcUrl) });
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(rpcUrl) });
  const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });

  const client = new NovakClient(publicClient, wallet(owner), addresses);
  const counterpartyClient = new NovakClient(publicClient, wallet(counterparty), addresses);

  // The next block's timestamp is at least both the latest block's and
  // wall-clock time (anvil may have been fast-forwarded, or idle for a while).
  const chainNow = async () => (await publicClient.getBlock()).timestamp;
  const wallNow = () => BigInt(Math.floor(Date.now() / 1000));
  const nowish = async () => { const c = await chainNow(); const w = wallNow(); return c > w ? c : w; };
  const opensAt = (await nowish()) + 60n;

  console.log("Step 1: creating two specVersion-2 events (observation opens in 60s)…");
  const mkEvent = async (name: string) => {
    const tx = await client.createEvent(
      {
        specVersion: 2,
        sourceId: sourceId(name),
        openTimestamp: opensAt,
        observationDeadline: opensAt + 86_400n,
        disputeWindowSeconds: 3_600n,
        quorumThreshold: 2,
        spec: "0x",
      },
      owner,
    );
    return client.getCreatedEventId(tx);
  };
  const eventA = await mkEvent("macro.fomc.v1");
  // Not a catalog sourceId: this script plays the resolvers itself, so no
  // real resolver daemon should try to observe these events.
  const eventB = await mkEvent("example.nvda-threshold");
  console.log(`  eventA=${eventA}\n  eventB=${eventB}`);

  console.log("Step 2: composing WITHIN(48h)…");
  const compositeTx = await client.createComposite(
    { op: CompositeOp.Within, operands: [eventA, eventB], window: 48n * 3600n },
    owner,
  );
  const compositeLog = (await wait(compositeTx)).logs.find(
    (l) => l.address.toLowerCase() === addresses.eventComposer.toLowerCase(),
  );
  if (!compositeLog?.topics[1]) throw new Error("could not find CompositeEventCreated log");
  const compositeId = compositeLog.topics[1] as `0x${string}`;
  console.log(`  compositeId=${compositeId}`);

  console.log("Step 3: opening a USDG market and taking opposite sides…");
  const marketTx = await client.createMarket(compositeId, opensAt, "Fed holds WITHIN 48h of NVDA >= $250?", owner);
  const marketId = await client.getCreatedMarketId(marketTx);
  for (const [c, acct] of [
    [client, owner],
    [counterpartyClient, counterparty],
  ] as const) {
    await wait(await c.mintTestCollateral(acct.address, USDG(1_000), acct));
    await wait(await c.approveCollateral(USDG(100), acct));
  }
  await wait(await client.depositCollateral(marketId, true, USDG(100), owner));
  await wait(await counterpartyClient.depositCollateral(marketId, false, USDG(100), counterparty));
  console.log(`  marketId=${marketId} — owner YES 100 USDG, counterparty NO 100 USDG`);

  console.log("Step 4: window opens; resolvers observe (outcome + occurredAt)…");
  await testClient.increaseTime({ seconds: 61 });
  await testClient.mine({ blocks: 1 });
  const occurredAt = await chainNow(); // the block we just mined: <= next block's timestamp
  for (const resolver of resolvers) {
    for (const eventId of [eventA, eventB]) {
      await wait(
        await wallet(resolver).writeContract({
          account: resolver,
          chain: foundry,
          address: addresses.eventRegistry,
          abi: eventRegistryAbi,
          functionName: "submitObservation",
          args: [eventId, encodeOutcomeV2(true, occurredAt), keccak256(toBytes(`evidence-${resolver.address}-${eventId}`))],
        }),
      );
    }
  }
  console.log("  quorum reached on both events (2-of-2 resolvers agreed)");

  console.log("Step 5: dispute window elapses -> finalize, resolve composite…");
  await testClient.increaseTime({ seconds: 3_601 });
  await testClient.mine({ blocks: 1 });
  for (const eventId of [eventA, eventB]) await wait(await client.finalize(eventId, owner));
  await wait(await client.tryResolveComposite(compositeId, owner));
  const composite = await client.getResolvedComposite(compositeId);
  console.log(`  composite resolved=${composite.resolved} outcome=${composite.outcome}`);

  console.log("Step 6: settling and claiming…");
  const treasuryBefore = await client.collateralBalance(owner.address);
  await wait(await client.settleMarket(marketId, owner));
  const market = await client.getMarket(marketId);
  console.log(`  status=${market.status} outcome=${market.outcome} fee=${market.feeTaken} (1% of losing pool)`);

  const payout = await client.payoutOf(marketId, owner.address);
  await wait(await client.claim(marketId, owner));
  console.log(`  winner claimed ${Number(payout) / 1e6} USDG`);
  const treasuryAfter = await client.collateralBalance(owner.address);
  console.log(`  (owner is also treasury on anvil: +${Number(treasuryAfter - treasuryBefore) / 1e6} USDG incl. fee)`);

  const outcome = decodeOutcome((await client.readOutcome(eventA)).outcomeData);
  console.log(`\neventA outcome via Bus: ${outcome.outcome}, occurredAt=${outcome.occurredAt}`);
  console.log(`Markets on-chain: ${(await client.listMarketIds()).length}; events: ${(await client.listEvents(0n)).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
