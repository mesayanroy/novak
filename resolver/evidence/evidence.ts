import { keccak256, toBytes } from "viem";
import { encodeBoolOutcome } from "@novak/sdk";
import type { Observation } from "../adapters/types.js";

/**
 * Produces a commitment (hash) for an Observation's evidence, suitable for
 * submission on-chain alongside the outcome — keeping the chain's job to
 * verification of a commitment rather than storage/processing of raw
 * evidence.
 *
 * TODO(protocol semantics): whether raw evidence is also published off-chain
 * (e.g. IPFS, with only the hash on-chain) is not yet decided. Placeholder
 * hashes a JSON-stringified evidence blob directly.
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
 * Encodes an observation's boolean outcome for on-chain submission, per the
 * finalized MVP outcome-payload schema (see @novak/sdk's `encodeBoolOutcome`
 * and docs/protocol-spec.md).
 */
export function encodeOutcomeData(outcomeData: boolean): `0x${string}` {
  return encodeBoolOutcome(outcomeData);
}
