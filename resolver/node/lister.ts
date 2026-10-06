import { parseAbi, parseAbiItem, type Abi, type Hex } from "viem";
import {
  CHAINLINK_FEED_CATALOG,
  NovakClient,
  buildPriceLadderSpecs,
  decodePriceAtSpec,
  distributionMarketAbi,
  eventRegistryAbi,
  ladderBucketLabels,
  marketAbi,
  mockUsdgAbi,
  type ChainlinkFeedInfo,
} from "@novakoracle/sdk";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { Log } from "./log.js";

/**
 * Market lister: keeps a live range market (and a yes/no market reusing the
 * same boundary event) open on every listed Chainlink feed, and rolls a new
 * one each trading day. Each listing is:
 *   - one `createEvents` tx: 5 "feed ≥ X at T" boundary events centred on the
 *     live mainnet price (T = the next 4pm New York close; daily for 24/7 feeds);
 *   - a DistributionMarket (6 ranges, LMSR, subsidy b·ln 6 in test USDG);
 *   - a yes/no Market on the centre boundary ("close at or above $X?"), which
 *     settles on the SAME Novak event as the range market's middle boundary.
 * The resolvers then observe, the dispute window runs, the keeper settles.
 * Runs on the keeper node (RESOLVER_LISTER=false to disable); every call it makes is
 * one any user could make from the Builder.
 */

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
const marketCreated = parseAbiItem(
  "event MarketCreated(bytes32 indexed marketId, address indexed creator, bytes32[] boundaryEventIds, uint256 liquidity, uint64 tradingClosesAt, string question)",
);

const HOUR = 3600n;
const DAY = 86_400n;
/** Stablecoins and wrapped/bridged duplicates: nothing to forecast. */
const SKIP = new Set(["USDC", "USDT", "USDE", "USDG", "USDS", "EURC", "SYRUPUSDC", "BTC.B", "CBBTC", "LBTC", "WBTC", "WEETH", "WSTETH", "USAR"]);

export interface ListerConfig {
  enabled: boolean;
  /** Symbols to list; empty = every equity, bond and major crypto feed. */
  symbols: string[];
  /** New listings per pass (spreads gas and log volume over a few ticks). */
  maxPerPass: number;
  /** LMSR liquidity b per range market, in USDG base units (6 dp). */
  liquidity: bigint;
  disputeWindowSeconds: bigint;
  /** Minimum time between passes. */
  intervalMs: number;
}

export function listerConfig(env: NodeJS.ProcessEnv = process.env): ListerConfig {
  return {
    // On by default on the keeper node; RESOLVER_LISTER=false turns it off, =true forces it on.
    enabled: env.RESOLVER_LISTER === "true" || (env.RESOLVER_KEEPER === "true" && env.RESOLVER_LISTER !== "false"),
    symbols: (env.RESOLVER_LIST_SYMBOLS ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    maxPerPass: Number(env.RESOLVER_LIST_MAX_PER_PASS ?? 4),
    liquidity: BigInt(env.RESOLVER_LIST_LIQUIDITY ?? 200_000_000),
    disputeWindowSeconds: BigInt(env.RESOLVER_LIST_DISPUTE_WINDOW ?? 1800),
    intervalMs: Number(env.RESOLVER_LIST_INTERVAL_MS ?? 120_000),
  };
}

export function listedFeeds(symbols: string[]): ChainlinkFeedInfo[] {
  const all = CHAINLINK_FEED_CATALOG.filter((f) => !SKIP.has(f.symbol));
  if (!symbols.length) return all;
  const want = new Set(symbols);
  return all.filter((f) => want.has(f.symbol));
}

/** 24/5 equity feeds resolve at the 4pm New York close (20:00 UTC, EDT) on a weekday; 24/7 feeds daily at 20:00 UTC. */
export function nextClose(nowS: bigint, weekdaysOnly: boolean, minLead = 3n * HOUR): bigint {
  let t = (nowS / DAY) * DAY + 20n * HOUR;
  for (;;) {
    const dow = Number(((t / DAY) + 4n) % 7n); // 1970-01-01 was a Thursday; 0 = Sunday
    if (t >= nowS + minLead && (!weekdaysOnly || (dow !== 0 && dow !== 6))) return t;
    t += DAY;
  }
}

/** The readable boundary step nearest `pct` of spot: 1, 2, 2.5 or 5 × 10^k (feed units). */
export function niceStep(spot: bigint, pctBps: bigint): bigint {
  const raw = (spot * pctBps) / 10_000n;
  if (raw <= 0n) return 1n;
  let mag = 1n;
  while (mag * 10n <= raw) mag *= 10n;
  let best = mag;
  for (const m of [10n, 20n, 25n, 50n, 100n]) {
    const s = (mag * m) / 10n;
    const d = (x: bigint) => (x > raw ? x - raw : raw - x);
    if (d(s) < d(best)) best = s;
  }
  return best;
}

export function ladderFor(spot: bigint, f: Pick<ChainlinkFeedInfo, "assetClass" | "symbol">): bigint[] {
  const pct = f.assetClass === "Bond" ? 5n : f.assetClass === "Crypto" && f.symbol !== "GLD" ? 150n : 100n; // bps
  const step = niceStep(spot, pct);
  const centre = (spot / step) * step;
  return [-2n, -1n, 0n, 1n, 2n].map((k) => centre + k * step).filter((x) => x > 0n);
}

const fmtUsd = (v: bigint, decimals: number) => {
  const n = Number(v) / 10 ** decimals;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`;
};

export class ListerDuty {
  /** feed (lowercase) → latest resolution time T of an open-or-future range market. */
  private readonly latestAt = new Map<string, bigint>();
  private scannedTo = 0n;
  private lastPass = 0;
  private approved = false;
  listed = 0;

  constructor(
    private readonly c: Clients,
    private readonly cfg: ListerConfig,
    private readonly log: Log,
    private readonly logChunk: bigint,
  ) {}

  private reader() {
    return new NovakClient(this.c.publicClient, undefined, this.c.deployment);
  }

  /** Incrementally learn every range market's (feed, T) from MarketCreated logs, whoever created it. */
  private async scan() {
    const dm = this.c.deployment.distributionMarket;
    if (!dm) return;
    const latest = await this.c.publicClient.getBlockNumber();
    let from = this.scannedTo ? this.scannedTo + 1n : BigInt(this.c.deployment.startBlock);
    while (from <= latest) {
      const to = from + this.logChunk - 1n > latest ? latest : from + this.logChunk - 1n;
      const logs = await this.c.publicClient.getLogs({ address: dm, event: marketCreated, fromBlock: from, toBlock: to });
      for (const l of logs) {
        const first = (l.args.boundaryEventIds as readonly Hex[] | undefined)?.[0];
        if (!first) continue;
        try {
          const spec = (await this.c.publicClient.readContract({
            address: this.c.deployment.eventRegistry,
            abi: eventRegistryAbi,
            functionName: "getEventSpec",
            args: [first],
          })) as { spec: Hex };
          const s = decodePriceAtSpec(spec.spec);
          const k = s.feed.toLowerCase();
          if ((this.latestAt.get(k) ?? 0n) < s.at) this.latestAt.set(k, s.at);
        } catch {
          /* not a price ladder */
        }
      }
      this.scannedTo = to;
      from = to + 1n;
    }
  }

  private async ensureCollateral(need: bigint) {
    const d = this.c.deployment;
    const me = this.c.account.address;
    const bal = (await this.c.publicClient.readContract({ address: d.collateral, abi: mockUsdgAbi, functionName: "balanceOf", args: [me] })) as bigint;
    if (bal < need) {
      if (!d.collateralIsMock) throw new Error(`lister needs ${need} USDG, has ${bal}`);
      const r = await send(this.c, { address: d.collateral, abi: mockUsdgAbi as Abi, functionName: "mint", args: [me, need * 20n] });
      if (!r.ok) throw new Error(`mint test USDG: ${r.reason}`);
    }
    if (!this.approved) {
      const allowance = (await this.c.publicClient.readContract({
        address: d.collateral,
        abi: mockUsdgAbi,
        functionName: "allowance",
        args: [me, d.distributionMarket!],
      })) as bigint;
      if (allowance < need * 100n) {
        const r = await send(this.c, { address: d.collateral, abi: mockUsdgAbi as Abi, functionName: "approve", args: [d.distributionMarket!, 2n ** 255n] });
        if (!r.ok) throw new Error(`approve: ${r.reason}`);
      }
      this.approved = true;
    }
  }

  private async list(f: ChainlinkFeedInfo, now: bigint): Promise<boolean> {
    const d = this.c.deployment;
    const [, answer, , updatedAt] = (await this.c.sourceClient.readContract({ address: f.address, abi: feedAbi, functionName: "latestRoundData" })) as readonly [bigint, bigint, bigint, bigint, bigint];
    if (answer <= 0n || now - updatedAt > 4n * DAY) {
      this.log.info(`lister skip ${f.symbol}: feed stale or empty`);
      return false;
    }
    const T = nextClose(now, f.marketHours !== "Crypto" && f.assetClass !== "Crypto");
    const thresholds = ladderFor(answer, f);
    if (thresholds.length < 3) return false;

    const specs = buildPriceLadderSpecs({
      feed: f.address,
      thresholds,
      at: T,
      maxStaleness: 3n * DAY,
      openTimestamp: T,
      observationDeadline: T + DAY,
      disputeWindowSeconds: this.cfg.disputeWindowSeconds,
    });
    const ev = await send(this.c, { address: d.eventRegistry, abi: eventRegistryAbi as Abi, functionName: "createEvents", args: [specs] });
    if (!ev.ok) throw new Error(`createEvents ${f.symbol}: ${ev.reason}`);
    const ids = await this.reader().getCreatedEventIds(ev.hash);

    const day = new Date(Number(T) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const labels = ladderBucketLabels(thresholds, f.decimals);
    const q = `Where will ${f.symbol} close on ${day}? (${labels.join(" | ")})`.slice(0, 280);
    const dm = await send(this.c, {
      address: d.distributionMarket!,
      abi: distributionMarketAbi as Abi,
      functionName: "createMarket",
      args: [q, ids, T, this.cfg.liquidity],
    });
    if (!dm.ok) throw new Error(`range market ${f.symbol}: ${dm.reason}`);

    // A yes/no market on the centre boundary — the same Novak event, reused.
    const mid = Math.floor(ids.length / 2);
    const yn = `Will ${f.symbol} close at or above ${fmtUsd(thresholds[mid], f.decimals)} on ${day}?`.slice(0, 280);
    const bm = await send(this.c, { address: d.market, abi: marketAbi as Abi, functionName: "createMarket", args: [ids[mid], T, yn] });
    if (!bm.ok) this.log.warn(`lister yes/no ${f.symbol}: ${bm.reason}`);

    this.latestAt.set(f.address.toLowerCase(), T);
    this.listed++;
    this.log.info(`lister listed ${f.symbol} @ ${fmtUsd(answer, f.decimals)} → T=${new Date(Number(T) * 1000).toISOString()} (${ids.length} boundaries)`);
    return true;
  }

  async tick(now: bigint): Promise<void> {
    if (!this.cfg.enabled || !this.c.deployment.distributionMarket) return;
    if (Date.now() - this.lastPass < this.cfg.intervalMs) return;
    this.lastPass = Date.now();
    await this.scan();
    // A feed needs a listing when it has no market whose T is still ahead.
    const due = listedFeeds(this.cfg.symbols).filter((f) => (this.latestAt.get(f.address.toLowerCase()) ?? 0n) <= now + HOUR);
    if (!due.length) return;
    // Subsidy b·ln 6 ≈ 1.792·b, with headroom.
    await this.ensureCollateral((this.cfg.liquidity * 2n) * BigInt(Math.min(due.length, this.cfg.maxPerPass)));
    let n = 0;
    for (const f of due) {
      if (n >= this.cfg.maxPerPass) break;
      try {
        if (await this.list(f, now)) n++;
      } catch (e) {
        this.log.warn(`lister ${f.symbol}: ${(e as Error).message}`);
      }
    }
    if (due.length > n) this.log.info(`lister: ${due.length - n} feed(s) still to list, next pass in ${Math.round(this.cfg.intervalMs / 1000)}s`);
  }
}

