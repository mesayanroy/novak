/**
 * Canonical Novak flow, fully wired end-to-end against a local anvil chain:
 *
 *   1. Create two primitive events (Registry).
 *   2. Authorize two resolvers and have each submit a matching observation
 *      for both events, reaching quorum (Registry).
 *   3. Advance time past the dispute window and finalize both events.
 *   4. Compose AND/WITHIN(48h) over the two primitives (Composer) and resolve it.
 *   5. Create a derivatives Market against the composite event ID and take
 *      two opposing positions.
 *   6. Settle the Market against the finalized composite outcome and claim.
 *
 * Run:
 *   1. anvil
 *   2. forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 *   3. Put the printed addresses in .env (see .env.example)
 *   4. pnpm tsx examples/end-to-end-flow.ts
 *
 * The two "resolver" and one "counterparty" accounts below use anvil's
 * well-known, publicly documented default test private keys (from the
 * "test test test ... junk" mnemonic every `anvil` instance starts with).
 * They are NOT secret and must NEVER be used for anything but a local anvil
 * chain.
 */
import { createPublicClient, createTestClient, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  NovakClient,
  CompositeOp,
  eventRegistryAbi,
  decodeBoolOutcome,
  encodeBoolOutcome,
  type NovakAddresses,
} from "../sdk/src/index.js";
import { keccak256, toBytes } from "viem";

// anvil's default account #1 and #2 private keys — public, local-only.
const RESOLVER_A_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const RESOLVER_B_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const COUNTERPARTY_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as const;

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY (see .env.example) before running this example.");
  }

  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const owner = privateKeyToAccount(privateKey as `0x${string}`);
  const resolverA = privateKeyToAccount(RESOLVER_A_KEY);
  const resolverB = privateKeyToAccount(RESOLVER_B_KEY);
  const counterparty = privateKeyToAccount(COUNTERPARTY_KEY);

  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const ownerWallet = createWalletClient({ account: owner, chain: foundry, transport: http(rpcUrl) });
  const resolverAWallet = createWalletClient({ account: resolverA, chain: foundry, transport: http(rpcUrl) });
  const resolverBWallet = createWalletClient({ account: resolverB, chain: foundry, transport: http(rpcUrl) });
  const counterpartyWallet = createWalletClient({ account: counterparty, chain: foundry, transport: http(rpcUrl) });
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(rpcUrl) }).extend(
    publicActions,
  );

  const addresses: NovakAddresses = {
    eventRegistry: requireEnv("EVENT_REGISTRY_ADDRESS"),
    eventBus: requireEnv("EVENT_BUS_ADDRESS"),
    eventComposer: requireEnv("EVENT_COMPOSER_ADDRESS"),
    subscriptionManager: requireEnv("SUBSCRIPTION_MANAGER_ADDRESS"),
    settlement: requireEnv("SETTLEMENT_ADDRESS"),
    positionManager: requireEnv("POSITION_MANAGER_ADDRESS"),
    market: requireEnv("MARKET_ADDRESS"),
  };

  const client = new NovakClient(publicClient, ownerWallet, addresses);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Step 1: creating two primitive events…");
  const txA = await client.createEvent(
    {
      specVersion: 1,
      sourceId: keccak256(toBytes("example.rate-decision")),
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      quorumThreshold: 2,
      spec: "0x",
    },
    owner,
  );
  const eventA = await client.getCreatedEventId(txA);
  const txB = await client.createEvent(
    {
      specVersion: 1,
      sourceId: keccak256(toBytes("example.price-feed")),
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      quorumThreshold: 2,
      spec: "0x",
    },
    owner,
  );
  const eventB = await client.getCreatedEventId(txB);
  console.log(`  eventA=${eventA}\n  eventB=${eventB}`);

  console.log("Step 2: authorizing resolvers and submitting matching observations…");
  // Resolver authorization/observation submission are protocol-admin and
  // resolver actions respectively — intentionally not part of the
  // consumer-facing NovakClient (see resolver/node/index.ts, which is where
  // real resolvers submit from). Called directly here for this demo script.
  for (const resolver of [resolverA, resolverB]) {
    const hash = await ownerWallet.writeContract({
      account: owner,
      chain: foundry,
      address: addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "setResolverAuthorization",
      args: [resolver.address, true],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  for (const [wallet, resolver] of [
    [resolverAWallet, resolverA],
    [resolverBWallet, resolverB],
  ] as const) {
    for (const eventId of [eventA, eventB]) {
      const hash = await wallet.writeContract({
        account: resolver,
        chain: foundry,
        address: addresses.eventRegistry,
        abi: eventRegistryAbi,
        functionName: "submitObservation",
        args: [eventId, encodeBoolOutcome(true), keccak256(toBytes(`evidence-${resolver.address}-${eventId}`))],
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }
  console.log("  quorum reached on both events (2-of-2 authorized resolvers agreed: true)");

  console.log("Step 3: advancing past the dispute window and finalizing…");
  await testClient.increaseTime({ seconds: 3_601 });
  await testClient.mine({ blocks: 1 });
  for (const eventId of [eventA, eventB]) {
    const hash = await client.finalize(eventId, owner);
    await publicClient.waitForTransactionReceipt({ hash });
  }
  console.log(`  eventA finalized: ${await client.isFinalized(eventA)}`);
  console.log(`  eventB finalized: ${await client.isFinalized(eventB)}`);

  console.log("Step 4: composing AND / WITHIN(48h) and resolving the composite…");
  const compositeTx = await client.createComposite(
    { op: CompositeOp.Within, operands: [eventA, eventB], window: 48n * 3600n },
    owner,
  );
  await publicClient.waitForTransactionReceipt({ hash: compositeTx });
  // compositeId isn't returned by a log topic the same way (no indexed
  // operands array), so recompute it the same way the contract does, or read
  // it from the CompositeEventCreated event's data. Simplest for a demo: the
  // Composer's createComposite return value IS the compositeId, but since we
  // only have a tx hash from the SDK's write call, decode the event log.
  const compositeReceipt = await publicClient.waitForTransactionReceipt({ hash: compositeTx });
  const compositeLog = compositeReceipt.logs.find(
    (l) => l.address.toLowerCase() === addresses.eventComposer.toLowerCase(),
  );
  if (!compositeLog?.topics[1]) throw new Error("could not find CompositeEventCreated log");
  const compositeId = compositeLog.topics[1] as `0x${string}`;

  const resolveTx = await client.tryResolveComposite(compositeId, owner);
  await publicClient.waitForTransactionReceipt({ hash: resolveTx });
  const { resolved, outcome: compositeOutcome } = await client.getResolvedComposite(compositeId);
  console.log(`  compositeId=${compositeId} resolved=${resolved} outcome=${compositeOutcome}`);

  console.log("Step 5: creating a market and taking two opposing positions…");
  const marketTx = await client.createMarket(compositeId, owner);
  const marketId = await client.getCreatedMarketId(marketTx);

  const { parseEther } = await import("viem");
  const client2 = new NovakClient(publicClient, ownerWallet, addresses);
  await client2.depositCollateral(marketId, true, parseEther("0.1"), owner);
  const counterpartyClient = new NovakClient(publicClient, counterpartyWallet, addresses);
  await counterpartyClient.depositCollateral(marketId, false, parseEther("0.1"), counterparty);
  console.log(`  marketId=${marketId} — owner backs YES, counterparty backs NO, 0.1 ETH each`);

  console.log("Step 6: settling and claiming…");
  const settleTx = await client.settleMarket(marketId, owner);
  await publicClient.waitForTransactionReceipt({ hash: settleTx });

  const market = await client.getMarket(marketId);
  console.log(`  market settled=${market.settled} outcome=${market.outcome}`);

  const winner = market.outcome ? client2 : counterpartyClient;
  const winnerAccount = market.outcome ? owner : counterparty;
  const claimTx = await winner.claim(marketId, winnerAccount);
  await publicClient.waitForTransactionReceipt({ hash: claimTx });
  console.log(`  winner claimed payout, tx=${claimTx}`);

  const outcome = await client.readOutcome(compositeId);
  console.log(`\nFinal composite outcome (decoded): ${decodeBoolOutcome(outcome.outcomeData)}`);
}

function requireEnv(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} — deploy contracts first (see script/Deploy.s.sol)`);
  return value as `0x${string}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
