import { parseAbiItem, type PublicClient } from "viem";
import { SOURCES, decodeCorporateActionSpec } from "@novakoracle/sdk";
import { findBlockAtOrBefore } from "../lib/chain.js";
import type { Observation, ObserveContext, SourceAdapter } from "./types.js";

/** Verified on Robinhood Chain mainnet (NVDA token, block 58952659):
 *  topic0 0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055. */
export const uiMultiplierUpdated = parseAbiItem(
  "event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAt)",
);

/** How far before windowStart to look for the scheduling log (changes are announced ahead). */
const LOOKBACK_SECONDS = 14n * 24n * 3600n;
const SETTLE_GRACE_SECONDS = 60n;
const BPS = 10_000n;

export interface MultiplierChange {
  oldMultiplier: bigint;
  newMultiplier: bigint;
  effectiveAt: bigint;
  scheduledAt: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/** |new/old - 1| in bps. */
export function changeBps(oldM: bigint, newM: bigint): bigint {
  if (oldM === 0n) return 0n;
  const diff = newM > oldM ? newM - oldM : oldM - newM;
  return (diff * BPS) / oldM;
}

/**
 * Pure decision logic, separated for testing. `changes` in chain order.
 * A later schedule supersedes an earlier one that hadn't taken effect yet.
 */
export function decideCorporateAction(
  changes: MultiplierChange[],
  spec: { windowStart: bigint; windowEnd: bigint; minChangeBps: number },
  sourceNow: bigint,
): { outcome: boolean; occurredAt: bigint; matched?: MultiplierChange } | null {
  const live: MultiplierChange[] = [];
  for (const c of changes) {
    // Drop any earlier schedule that was still pending when this one landed.
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].effectiveAt > c.scheduledAt) live.splice(i, 1);
    }
    live.push(c);
  }

  const qualifying = live
    .filter((c) => c.effectiveAt >= spec.windowStart && c.effectiveAt <= spec.windowEnd)
    .filter((c) => changeBps(c.oldMultiplier, c.newMultiplier) >= BigInt(spec.minChangeBps))
    .filter((c) => c.effectiveAt + SETTLE_GRACE_SECONDS <= sourceNow);

  if (qualifying.length > 0) {
    const first = qualifying.reduce((a, b) => (b.effectiveAt < a.effectiveAt ? b : a));
    return { outcome: true, occurredAt: first.effectiveAt, matched: first };
  }
  if (sourceNow > spec.windowEnd + SETTLE_GRACE_SECONDS) {
    return { outcome: false, occurredAt: spec.windowEnd };
  }
  return null; // window still open, nothing qualifying yet — wait
}

/**
 * `rh.corporate-action.v1` (specVersion 2): "Robinhood Stock Token S had a
 * multiplier change of >= N bps take effect within [windowStart, windowEnd]".
 * This is the fact Chainlink explicitly does not provide ("no corporate-action
 * calendar data or automated pause triggers") and that Robinhood's docs tell
 * every lending/DEX integrator to track themselves.
 *
 * Source: the token's ERC-8056 `UIMultiplierUpdated(old, new, effectiveAt)`
 * logs on Robinhood Chain MAINNET (the testnet stock tokens don't implement
 * ERC-8056 — verified). Logs, not historical state: the public RPC is not an
 * archive node. occurredAt = effectiveAt (true) or windowEnd (false).
 */
export class CorporateActionAdapter implements SourceAdapter {
  readonly name = SOURCES.corporateAction;
  private readonly blockCache = new Map<bigint, bigint>();

  constructor(
    private readonly source: PublicClient,
    private readonly logChunk: bigint = 2_000_000n,
  ) {}

  async observe(ctx: ObserveContext): Promise<Observation | null> {
    const spec = decodeCorporateActionSpec(ctx.spec.spec);
    const sourceNow = (await this.source.getBlock()).timestamp;
    if (sourceNow < spec.windowStart) return null;

    const changes = await this.fetchChanges(spec.stockToken, spec.windowStart - LOOKBACK_SECONDS);
    const decision = decideCorporateAction(changes, spec, sourceNow);
    if (!decision) return null;

    return {
      outcome: decision.outcome,
      occurredAt: decision.occurredAt,
      rawEvidence: {
        source: "erc8056-logs",
        chain: "robinhood-mainnet",
        stockToken: spec.stockToken,
        window: [spec.windowStart, spec.windowEnd],
        minChangeBps: spec.minChangeBps,
        changesSeen: changes.length,
        matched: decision.matched
          ? { ...decision.matched, changeBps: changeBps(decision.matched.oldMultiplier, decision.matched.newMultiplier) }
          : null,
      },
    };
  }

  /**
   * Per-token log cache: logs are immutable, so after the first scan only
   * blocks newer than the last scan are fetched (the first scan of ~14 days
   * of 100ms blocks is the expensive part).
   */
  private readonly logCache = new Map<string, { fromBlock: bigint; toBlock: bigint; changes: MultiplierChange[] }>();

  private async fetchChanges(token: `0x${string}`, fromTs: bigint): Promise<MultiplierChange[]> {
    const fromBlock = await this.cachedBlockAt(fromTs);
    const latest = await this.source.getBlockNumber();
    const key = token.toLowerCase();
    const cached = this.logCache.get(key);
    if (cached && cached.fromBlock <= fromBlock) {
      const fresh = cached.toBlock < latest ? await this.scan(token, cached.toBlock + 1n, latest) : [];
      cached.changes.push(...fresh);
      cached.toBlock = latest;
      return cached.changes.filter((c) => c.blockNumber >= fromBlock);
    }
    const changes = await this.scan(token, fromBlock, latest);
    this.logCache.set(key, { fromBlock, toBlock: latest, changes });
    return changes;
  }

  private async scan(token: `0x${string}`, fromBlock: bigint, latest: bigint): Promise<MultiplierChange[]> {
    const out: MultiplierChange[] = [];
    for (let start = fromBlock; start <= latest; start += this.logChunk) {
      const end = start + this.logChunk - 1n > latest ? latest : start + this.logChunk - 1n;
      const logs = await this.source.getLogs({ address: token, event: uiMultiplierUpdated, fromBlock: start, toBlock: end });
      for (const l of logs) {
        const block = await this.source.getBlock({ blockNumber: l.blockNumber });
        out.push({
          oldMultiplier: l.args.oldMultiplier!,
          newMultiplier: l.args.newMultiplier!,
          effectiveAt: l.args.effectiveAt!,
          scheduledAt: block.timestamp,
          blockNumber: l.blockNumber,
          txHash: l.transactionHash,
        });
      }
    }
    return out;
  }

  private async cachedBlockAt(ts: bigint): Promise<bigint> {
    const hit = this.blockCache.get(ts);
    if (hit !== undefined) return hit;
    const b = await findBlockAtOrBefore(this.source, ts);
    this.blockCache.set(ts, b);
    return b;
  }
}
