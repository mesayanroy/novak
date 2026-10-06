import type { PublicClient } from "viem";
import { sourceId, type Hex } from "@novakoracle/sdk";
import { ChainlinkPriceAtAdapter } from "./chainlinkPriceAt.js";
import { CorporateActionAdapter } from "./corporateAction.js";
import { TradingStatusAdapter } from "./tradingStatus.js";
import { FedRateAdapter } from "./fedRate.js";
import type { SourceAdapter } from "./types.js";

/** sourceId (keccak256 of the catalog name) -> adapter able to observe it. */
export function buildAdapters(source: PublicClient): Map<Hex, SourceAdapter> {
  const adapters: SourceAdapter[] = [
    new ChainlinkPriceAtAdapter(source),
    new CorporateActionAdapter(source),
    new TradingStatusAdapter(),
    new FedRateAdapter(),
  ];
  return new Map(adapters.map((a) => [sourceId(a.name).toLowerCase() as Hex, a]));
}
