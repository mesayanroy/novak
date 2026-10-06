import { parseAbiItem, type Hex } from "viem";
import type { SourceAdapter } from "../adapters/types.js";
import { buildEvidence, hashEvidence, type EvidenceStore } from "../evidence/evidence.js";
import type { Clients } from "../lib/chain.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";
import type { ResolverDuty } from "./resolve.js";

const observationSubmitted = parseAbiItem(
  "event ObservationSubmitted(bytes32 indexed eventId, address indexed resolver, bytes32 outcomeHash, bytes32 evidenceHash)",
);

/**
 * Rebuilds this node's evidence after a restart. Evidence is kept in memory
 * (optionally on disk), but adapters are deterministic: re-observing a
 * price-at round, a corporate-action log or a Fed print reproduces the exact
 * JSON — and therefore the exact hash committed on-chain. For each of this
 * resolver's own observations whose evidence is missing, re-run the adapter
 * and keep the record ONLY if its hash matches the on-chain evidenceHash.
 * Snapshot facts (trading status "right now") can't be reproduced later and
 * are skipped. Runs once, after the first discovery sync.
 */
export class EvidenceBackfill {
  done = false;
  restored = 0;
  private chunk: bigint;

  constructor(
    private readonly c: Clients,
    private readonly index: EventIndex,
    private readonly adapters: Map<Hex, SourceAdapter>,
    private readonly evidence: EvidenceStore,
    private readonly resolver: ResolverDuty,
    private readonly log: Log,
    chunk: bigint,
  ) {
    this.chunk = chunk;
  }

  async run(now: bigint): Promise<void> {
    if (this.done) return;
    const latest = await this.c.publicClient.getBlockNumber();
    const mine: { eventId: Hex; evidenceHash: Hex }[] = [];
    let from = BigInt(this.c.deployment.startBlock);
    while (from <= latest) {
      const to = from + this.chunk - 1n > latest ? latest : from + this.chunk - 1n;
      try {
        const logs = await this.c.publicClient.getLogs({
          address: this.c.deployment.eventRegistry,
          event: observationSubmitted,
          args: { resolver: this.c.account.address },
          fromBlock: from,
          toBlock: to,
        });
        for (const l of logs) mine.push({ eventId: l.args.eventId as Hex, evidenceHash: l.args.evidenceHash as Hex });
        from = to + 1n;
      } catch (err) {
        if (this.chunk <= 1_000n) throw err;
        this.chunk /= 2n;
      }
    }

    let present = 0;
    for (const { eventId, evidenceHash } of mine) {
      if (this.evidence.has(evidenceHash)) {
        present++;
        continue;
      }
      const meta = this.index.primitives.get(eventId);
      const adapter = meta && this.adapters.get(meta.sourceId);
      if (!adapter) continue;
      try {
        const spec = await this.resolver.spec(eventId);
        const obs = await adapter.observe({ eventId, spec, now });
        if (!obs) continue;
        const record = buildEvidence(eventId, adapter.name, obs);
        if (hashEvidence(record).toLowerCase() === evidenceHash.toLowerCase()) {
          this.evidence.put(record);
          this.restored++;
        }
      } catch {
        /* source unavailable — the next restart can try again */
      }
    }
    this.done = true;
    if (mine.length)
      this.log.info(`evidence: ${present + this.restored} of ${mine.length} own observations available (${present} on disk, ${this.restored} re-derived and hash-verified)`);
  }
}
