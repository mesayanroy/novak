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

/** In-memory evidence store backing the /evidence endpoint. */
export class EvidenceStore {
  private readonly records = new Map<Hex, EvidenceRecord>();

  put(record: EvidenceRecord): Hex {
    const hash = hashEvidence(record);
    this.records.set(hash, record);
    return hash;
  }

  get(hash: Hex): EvidenceRecord | undefined {
    return this.records.get(hash.toLowerCase() as Hex) ?? this.records.get(hash);
  }

  get size(): number {
    return this.records.size;
  }
}
