import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { eventRegistryAbi } from "@novak/sdk";
import { PriceFeedAdapter } from "../adapters/priceFeedAdapter.js";
import { hashEvidence, encodeOutcomeData } from "../evidence/evidence.js";
import type { SourceAdapter } from "../adapters/types.js";

/**
 * Resolver daemon entrypoint. For each configured event ID, runs every
 * adapter matching that event's expected source and submits the resulting
 * observation directly to EventRegistry.submitObservation. Quorum,
 * proposal, and dispute-window bookkeeping all happen on-chain in the
 * Registry (see contracts/EventRegistry.sol) — this daemon's only job is
 * "fetch, evidence, submit".
 *
 * KNOWN MVP LIMITATION: there is no on-chain event discovery/indexer here —
 * a resolver is told exactly which event IDs to watch via
 * `RESOLVER_WATCHED_EVENT_IDS` rather than scanning the Registry for all Open
 * events matching its adapters' sourceIds. Building a subgraph-style indexer
 * is deferred; wiring one in would only change how `eventIds` below is
 * populated, not the submission logic itself.
 *
 * Run with: pnpm --filter novak-resolver dev
 */
const adapters: SourceAdapter[] = [new PriceFeedAdapter()];

async function submitForEvent(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  registryAddress: `0x${string}`,
  eventId: `0x${string}`,
): Promise<void> {
  for (const adapter of adapters) {
    const observation = await adapter.fetchObservation(eventId, null);
    const evidenceHash = hashEvidence(observation);
    const outcomeData = encodeOutcomeData(observation.outcomeData);

    console.log(
      `[resolver] eventId=${eventId} source=${adapter.sourceId} outcome=${observation.outcomeData} evidenceHash=${evidenceHash}`,
    );

    try {
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: walletClient.chain,
        address: registryAddress,
        abi: eventRegistryAbi,
        functionName: "submitObservation",
        args: [eventId, outcomeData, evidenceHash],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[resolver] submitted, tx=${hash}`);
    } catch (err) {
      // Common non-fatal cases: already submitted, event no longer accepting
      // observations (quorum already reached), or not an authorized resolver
      // yet. Log and move on rather than crashing the daemon.
      console.warn(`[resolver] submission failed for ${eventId}:`, (err as Error).message);
    }
  }
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const privateKey = process.env.RESOLVER_PRIVATE_KEY;
  const registryAddress = process.env.EVENT_REGISTRY_ADDRESS;
  const eventIdsRaw = process.env.RESOLVER_WATCHED_EVENT_IDS ?? "";

  if (!privateKey || !registryAddress) {
    console.log(
      "[resolver] RESOLVER_PRIVATE_KEY / EVENT_REGISTRY_ADDRESS not set — nothing to do. See .env.example.",
    );
    return;
  }

  const eventIds = eventIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as `0x${string}`[];

  if (eventIds.length === 0) {
    console.log("[resolver] RESOLVER_WATCHED_EVENT_IDS is empty — nothing to watch. See resolver/README.md.");
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: foundry, transport: http(rpcUrl) });

  const pollIntervalMs = Number(process.env.RESOLVER_POLL_INTERVAL_MS ?? 15000);
  console.log(
    `[resolver] starting as ${account.address}, watching ${eventIds.length} event(s), poll interval ${pollIntervalMs}ms`,
  );

  for (const eventId of eventIds) {
    await submitForEvent(publicClient, walletClient, registryAddress as `0x${string}`, eventId);
  }
}

main().catch((err) => {
  console.error("[resolver] fatal error", err);
  process.exit(1);
});
