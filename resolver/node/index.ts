import { PriceFeedAdapter } from "../adapters/priceFeedAdapter.js";
import { hashEvidence } from "../evidence/evidence.js";
import { evaluateQuorum } from "../consensus/quorum.js";
import type { SourceAdapter } from "../adapters/types.js";

/**
 * Resolver daemon entrypoint. Polls open events this resolver knows how to serve
 * (via its adapters), fetches observations, and (once contracts support it)
 * submits them to EventRegistry for quorum. Currently logs the flow instead of
 * submitting on-chain — wiring up a real registry write is TODO pending the
 * submitObservation() contract method (see contracts/EventRegistry.sol TODOs).
 *
 * Run with: pnpm --filter novak-resolver dev
 */
const adapters: SourceAdapter[] = [new PriceFeedAdapter()];

async function pollOnce(): Promise<void> {
  for (const adapter of adapters) {
    // TODO: replace with a real query against EventRegistry for open events
    // matching adapter.sourceId. Placeholder uses a fake event ID.
    const placeholderEventId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

    const observation = await adapter.fetchObservation(placeholderEventId, null);
    const evidenceHash = hashEvidence(observation);
    const quorum = evaluateQuorum([observation]);

    console.log(`[resolver] source=${adapter.sourceId} evidenceHash=${evidenceHash}`);
    console.log(`[resolver] quorum reached=${quorum.reached} (${quorum.agreeingCount}/${quorum.totalCount})`);

    // TODO: submit observation + evidenceHash to EventRegistry once
    // submitObservation() exists on-chain.
  }
}

async function main(): Promise<void> {
  const pollIntervalMs = Number(process.env.RESOLVER_POLL_INTERVAL_MS ?? 15000);
  console.log(`[resolver] starting, poll interval ${pollIntervalMs}ms`);

  // Single pass for scaffolding; swap for setInterval once submission is real.
  await pollOnce();
}

main().catch((err) => {
  console.error("[resolver] fatal error", err);
  process.exit(1);
});
