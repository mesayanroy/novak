import { decodeAbiParameters, encodeAbiParameters, keccak256, toBytes } from "viem";
import type { Address, Hex } from "./types.js";

/**
 * The Robinhood Chain event catalog: every `sourceId` a Novak resolver has an
 * adapter for, and the ABI schema of each one's `EventSpec.spec` bytes.
 * `EventSpec.sourceId = sourceId(name)`. See docs/protocol-spec.md and
 * docs/ROBINHOOD_CHAIN_PLAN.md §5.2.
 */
export const SOURCES = {
  /** "Chainlink feed F compared to threshold X at time T" — specVersion 2. */
  priceAt: "chainlink.price-at.v1",
  /** "Stock token S had a multiplier change of >= N bps effective in [start, end]" — specVersion 2. */
  corporateAction: "rh.corporate-action.v1",
  /** "Stock token S is NOT tradable in session X when observed" — specVersion 1. */
  tradingStatus: "rh.trading-status.v1",
} as const;

export type SourceName = (typeof SOURCES)[keyof typeof SOURCES];

export function sourceId(name: string): Hex {
  return keccak256(toBytes(name));
}

/** Reverse lookup: on-chain sourceId -> catalog name (undefined if unknown). */
export function sourceName(id: Hex): SourceName | undefined {
  return Object.values(SOURCES).find((n) => sourceId(n).toLowerCase() === id.toLowerCase());
}

// --- chainlink.price-at.v1 ---

export enum Comparator {
  Gte = 0,
  Lte = 1,
}

export interface PriceAtSpec {
  /** Chainlink AggregatorV3 proxy on Robinhood Chain MAINNET (read-only source). */
  feed: Address;
  /** In the feed's own units (8 decimals for Robinhood stock feeds: $250 = 250_0000_0000n). */
  threshold: bigint;
  comparator: Comparator;
  /** Evaluate the latest round with updatedAt <= at. Also the outcome's occurredAt. */
  at: bigint;
  /** Abstain (don't vote) if that round is older than at - maxStaleness (e.g. market closed). */
  maxStaleness: bigint;
}

const priceAtParams = [
  { type: "address", name: "feed" },
  { type: "int256", name: "threshold" },
  { type: "uint8", name: "comparator" },
  { type: "uint64", name: "at" },
  { type: "uint64", name: "maxStaleness" },
] as const;

export function encodePriceAtSpec(s: PriceAtSpec): Hex {
  return encodeAbiParameters(priceAtParams, [s.feed, s.threshold, s.comparator, s.at, s.maxStaleness]);
}

export function decodePriceAtSpec(data: Hex): PriceAtSpec {
  const [feed, threshold, comparator, at, maxStaleness] = decodeAbiParameters(priceAtParams, data);
  return { feed, threshold, comparator: comparator as Comparator, at, maxStaleness };
}

// --- rh.corporate-action.v1 ---

export interface CorporateActionSpec {
  /** Canonical Robinhood Stock Token (ERC-8056) on Robinhood Chain MAINNET. */
  stockToken: Address;
  windowStart: bigint;
  windowEnd: bigint;
  /** Minimum |newMultiplier/oldMultiplier - 1| in bps. 0 = any change (incl. dividend reinvestment); a 2:1 split is 10000. */
  minChangeBps: number;
}

const corporateActionParams = [
  { type: "address", name: "stockToken" },
  { type: "uint64", name: "windowStart" },
  { type: "uint64", name: "windowEnd" },
  { type: "uint32", name: "minChangeBps" },
] as const;

export function encodeCorporateActionSpec(s: CorporateActionSpec): Hex {
  return encodeAbiParameters(corporateActionParams, [s.stockToken, s.windowStart, s.windowEnd, s.minChangeBps]);
}

export function decodeCorporateActionSpec(data: Hex): CorporateActionSpec {
  const [stockToken, windowStart, windowEnd, minChangeBps] = decodeAbiParameters(corporateActionParams, data);
  return { stockToken, windowStart, windowEnd, minChangeBps };
}

// --- rh.trading-status.v1 ---

export enum TradingSession {
  Market = 0,
  Extended = 1,
  Overnight = 2,
}

export interface TradingStatusSpec {
  /** Ticker as listed by api.robinhood.com/rhj/assets (e.g. "NVDA"). */
  symbol: string;
  session: TradingSession;
}

const tradingStatusParams = [
  { type: "string", name: "symbol" },
  { type: "uint8", name: "session" },
] as const;

export function encodeTradingStatusSpec(s: TradingStatusSpec): Hex {
  return encodeAbiParameters(tradingStatusParams, [s.symbol, s.session]);
}

export function decodeTradingStatusSpec(data: Hex): TradingStatusSpec {
  const [symbol, session] = decodeAbiParameters(tradingStatusParams, data);
  return { symbol, session: session as TradingSession };
}

// --- Well-known Robinhood Chain MAINNET data sources (verified 2026-09-25) ---

/** Chainlink "Robinhood <TICKER> / USD" feed proxies (8 decimals). Full list:
 *  https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json */
export const CHAINLINK_FEEDS_MAINNET: Record<string, Address> = {
  NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38",
  AAPL: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
  "USDG/USD": "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2",
  "ETH/USD": "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
};

/** Canonical Robinhood Stock Tokens (ERC-8056). Full list: api.robinhood.com/rhj/assets */
export const STOCK_TOKENS_MAINNET: Record<string, Address> = {
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
};
