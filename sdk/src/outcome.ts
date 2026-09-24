import { decodeAbiParameters, encodeAbiParameters, size } from "viem";
import type { Hex } from "./types.js";

/**
 * Encode/decode helpers for the outcome-payload schemas (IEventRegistry docs,
 * docs/protocol-spec.md):
 * - specVersion 1: `abi.encode(bool)`
 * - specVersion 2: `abi.encode(bool outcome, uint64 occurredAt)` — occurredAt
 *   is the real-world time the fact became true (unix seconds), used by
 *   BEFORE/WITHIN instead of finalization time.
 */
export function encodeBoolOutcome(value: boolean): Hex {
  return encodeAbiParameters([{ type: "bool" }], [value]);
}

export function decodeBoolOutcome(data: Hex): boolean {
  // The bool is the first ABI word in both schema versions.
  const [value] = decodeAbiParameters([{ type: "bool" }], data);
  return value;
}

export function encodeOutcomeV2(value: boolean, occurredAt: bigint): Hex {
  return encodeAbiParameters([{ type: "bool" }, { type: "uint64" }], [value, occurredAt]);
}

/** Decodes either schema; `occurredAt` is set only for a 64-byte v2 payload. */
export function decodeOutcome(data: Hex): { outcome: boolean; occurredAt?: bigint } {
  if (size(data) >= 64) {
    const [outcome, occurredAt] = decodeAbiParameters([{ type: "bool" }, { type: "uint64" }], data);
    return { outcome, occurredAt };
  }
  return { outcome: decodeBoolOutcome(data) };
}

/** Encodes an observation for an event of the given specVersion. */
export function encodeOutcomeForVersion(specVersion: number, value: boolean, occurredAt: bigint): Hex {
  return specVersion >= 2 ? encodeOutcomeV2(value, occurredAt) : encodeBoolOutcome(value);
}
