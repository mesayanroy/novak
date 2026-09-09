import { decodeAbiParameters, encodeAbiParameters } from "viem";
import type { Hex } from "./types.js";

/**
 * Encode/decode helpers for the finalized MVP outcome-payload schema
 * (IEventRegistry docs, specVersion 1): every event's `outcomeData` is
 * `abi.encode(bool)`. Used by resolvers when submitting observations and by
 * consumers decoding `Outcome.outcomeData` / `IEventComposer` results.
 */
export function encodeBoolOutcome(value: boolean): Hex {
  return encodeAbiParameters([{ type: "bool" }], [value]);
}

export function decodeBoolOutcome(data: Hex): boolean {
  const [value] = decodeAbiParameters([{ type: "bool" }], data);
  return value;
}
