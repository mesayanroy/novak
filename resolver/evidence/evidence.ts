import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toBytes, type Hex } from "viem";
import type { Observation } from "../adapters/types.js";
import { toJson } from "../lib/chain.js";

/**
 * Evidence commitment for an observation. Only this hash goes on-chain
 * (`submitObservation`'s evidenceHash); the full JSON blob is kept by the
 * resolver and served at GET /evidence/:hash (node/server.ts) so a disputer —
 * or a judge — can check exactly what the resolver saw.
 *
 * The blob deliberately excludes the resolver's local clock, so two honest
 * resolvers observing the same source produce the SAME evidence hash.
 */
export interface EvidenceRecord {
  eventId: Hex;
  source: string;
  outcome: boolean;
  occurredAt: string;
  rawEvidence: Record<string, unknown>;
}

export function buildEvidence(eventId: Hex, source: string, observation: Observation): EvidenceRecord {
  return {
    eventId,
    source,
    outcome: observation.outcome,
    occurredAt: observation.occurredAt.toString(),
    rawEvidence: JSON.parse(toJson(observation.rawEvidence)),
  };
}

export function hashEvidence(record: EvidenceRecord): Hex {
  return keccak256(toBytes(toJson(record)));
}

/**
 * Evidence store backing the /evidence endpoint. In memory by default; with a
 * directory (RESOLVER_EVIDENCE_DIR) every record is also written as
 * `<hash>.json` and reloaded on start, so a restart doesn't lose evidence.
 * Records are content-addressed, so several nodes can share one directory.
 */
export class EvidenceStore {
  private readonly records = new Map<Hex, EvidenceRecord>();

  constructor(private readonly dir?: string) {
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (!/^0x[0-9a-f]{64}\.json$/.test(f)) continue;
      try {
        this.records.set(f.slice(0, -5) as Hex, JSON.parse(readFileSync(join(dir, f), "utf8")) as EvidenceRecord);
      } catch {
        /* skip a corrupt file */
      }
    }
  }

  put(record: EvidenceRecord): Hex {
    const hash = hashEvidence(record).toLowerCase() as Hex;
    this.records.set(hash, record);
    if (this.dir) {
      try {
        writeFileSync(join(this.dir, `${hash}.json`), toJson(record));
      } catch {
        /* disk full / read-only: memory copy still serves */
      }
    }
    return hash;
  }

  has(hash: Hex): boolean {
    return this.records.has(hash.toLowerCase() as Hex);
  }

  get(hash: Hex): EvidenceRecord | undefined {
    return this.records.get(hash.toLowerCase() as Hex) ?? this.records.get(hash);
  }

  get size(): number {
    return this.records.size;
  }
}
