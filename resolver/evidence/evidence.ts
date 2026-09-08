import { keccak256, toBytes, encodeAbiParameters } from "viem";
import type { Observation } from "../adapters/types.js";

/**
 * Produces a commitment (hash) for an Observation's evidence, suitable for
 * submission on-chain alongside (or instead of) the raw evidence itself — keeping
 * the chain's job to verification of a commitment rather than storage/processing
 * of raw evidence.
 *
 * TODO(protocol semantics): exact encoding of what gets hashed (and whether raw
 * evidence is published off-chain, e.g. IPFS, with only the hash on-chain) is not
 * yet fixed. Placeholder hashes a JSON-stringified evidence blob.
 */
export function hashEvidence(observation: Observation): `0x${string}` {
  const serialized = JSON.stringify({
    eventId: observation.eventId,
    outcomeData: observation.outcomeData,
    observedAt: observation.observedAt,
    rawEvidence: observation.rawEvidence,
  });
  return keccak256(toBytes(serialized));
}

/**
 * Encodes an observation's outcome for on-chain submission.
 *
 * TODO: align this with IEventRegistry.Outcome.outcomeData decoding once the
 * outcome payload schema per specVersion is finalized on the contracts side.
 */
export function encodeOutcomeData(outcomeData: unknown): `0x${string}` {
  return encodeAbiParameters([{ type: "string" }], [JSON.stringify(outcomeData)]);
}
