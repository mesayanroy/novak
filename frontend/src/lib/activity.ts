"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { deployment, novakAddresses } from "./addresses";
import type { Portfolio, Position } from "./portfolio";

/**
 * The portfolio's history, rebuilt from contract logs only (no indexer, no
 * database): every range-market Trade and yes/no deposit/withdrawal on the
 * markets you touched, their settlements, your collections, the disputes you
 * filed and any vault rewards you claimed. Replaying them gives cost basis per
 * position, a mark-to-market value series and per-position price sparklines.
 */

const ev = {
  trade: parseAbiItem(
    "event Trade(bytes32 indexed marketId, address indexed trader, uint8 indexed bucket, bool isBuy, uint256 shares, uint256 collateral, uint256 fee, uint256[] pricesAfter)",
  ),
  rangeSettled: parseAbiItem("event MarketSettled(bytes32 indexed marketId, uint8 winningBucket, uint256 fees)"),
  rangeVoided: parseAbiItem("event MarketVoided(bytes32 indexed marketId, uint256 fees)"),
  redeemed: parseAbiItem("event Redeemed(bytes32 indexed marketId, address indexed trader, uint256 amount)"),
  deposited: parseAbiItem("event CollateralDeposited(bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount)"),
  withdrawn: parseAbiItem("event PositionWithdrawn(bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount)"),
  binSettled: parseAbiItem("event MarketSettled(bytes32 indexed marketId, bool outcome, uint256 fee)"),
  binRefunding: parseAbiItem("event MarketRefunding(bytes32 indexed marketId)"),
  claimed: parseAbiItem("event Claimed(bytes32 indexed marketId, address indexed trader, uint256 amount)"),
  disputeFiled: parseAbiItem("event DisputeFiled(bytes32 indexed eventId, address indexed disputer, uint256 bond)"),
  resolverReward: parseAbiItem("event ResolverRewardClaimed(bytes32 indexed eventId, address indexed resolver, uint256 amount)"),
  committeeReward: parseAbiItem("event CommitteeRewardClaimed(bytes32 indexed eventId, address indexed member, uint256 amount)"),
};

export type ActivityKind = "buy" | "sell" | "deposit" | "withdraw" | "collect" | "dispute" | "reward";

export interface ActivityItem {
  kind: ActivityKind;
  marketId?: Hex;
  eventId?: Hex;
  /** Range bucket or yes/no side. */
  bucket?: number;
  side?: "YES" | "NO";
  /** USDG (6 dp) for trades/collects/rewards; wei for dispute bonds. */
  amount: bigint;
  shares?: bigint;
  fee?: bigint;
  time: number;
  tx: Hex;
}

export interface PositionStats {
  /** Net cash put in: buys − sells (range) or deposits − withdrawals (yes/no). */
  invested: bigint;
  /** Collected so far (claim / redeem). */
  collected: bigint;
  fees: bigint;
  /** Probability of the outcome you hold most of, over time (0..1). */
  spark: { t: number; p: number }[];
  /** Current probability of that outcome. */
  price: number;
  /** Label of that outcome ("YES", "$200–210", …). */
  outcome: string;
}

export interface HistoryPoint {
  t: number;
  /** Mark-to-market value of all positions (USDG, float). */
  value: number;
  /** Cash in − cash out (USDG, float). value − invested = P&L. */
  invested: number;
}

export interface Activity {
  items: ActivityItem[];
  history: HistoryPoint[];
  stats: Record<string, PositionStats>;
  feesPaid: bigint;
  disputesFiled: number;
  disputeBondsWei: bigint;
  rewardsClaimed: bigint;
}

const blockTimes = new Map<bigint, number>();
async function timesFor(pc: PublicClient, blocks: bigint[]) {
  const todo = [...new Set(blocks)].filter((b) => !blockTimes.has(b));
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async (b) => {
        const blk = await pc.getBlock({ blockNumber: b });
        blockTimes.set(b, Number(blk.timestamp));
      }),
    );
  }
}

type AnyLog = { blockNumber: bigint; logIndex: number; transactionHash: Hex; args: Record<string, unknown>; eventName: string };
const order = (a: AnyLog, b: AnyLog) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
const f6 = (v: bigint) => Number(v) / 1e6;

async function load(pc: PublicClient, who: Address, portfolio: Portfolio): Promise<Activity> {
  const d = deployment!;
  const fromBlock = BigInt(d.startBlock);
  const me = who.toLowerCase();
  const range = novakAddresses.distributionMarket;
  const market = novakAddresses.market;
  const logs = <T extends (typeof ev)[keyof typeof ev]>(address: Address | undefined, event: T, args?: Record<string, unknown>) =>
    address
      ? (pc.getLogs({ address, event, args, fromBlock, toBlock: "latest" } as never) as unknown as Promise<AnyLog[]>).catch(() => [] as AnyLog[])
      : Promise.resolve([] as AnyLog[]);

  const [trades, rSettled, rVoided, redeemed, deps, wds, bSettled, bRefund, claimed, disputes, rr, cr] = await Promise.all([
    logs(range, ev.trade),
    logs(range, ev.rangeSettled),
    logs(range, ev.rangeVoided),
    logs(range, ev.redeemed, { trader: who }),
    logs(market, ev.deposited),
    logs(market, ev.withdrawn),
    logs(market, ev.binSettled),
    logs(market, ev.binRefunding),
    logs(market, ev.claimed, { trader: who }),
    logs(d.disputeManager, ev.disputeFiled, { disputer: who }),
    logs(d.treasuryVault, ev.resolverReward, { resolver: who }),
    logs(d.treasuryVault, ev.committeeReward, { member: who }),
  ]);

  const mine = (l: AnyLog) => String(l.args.trader).toLowerCase() === me;
  const touched = new Set([...trades.filter(mine), ...deps.filter(mine)].map((l) => String(l.args.marketId)));
  const onTouched = (l: AnyLog) => touched.has(String(l.args.marketId));
  const marketLogs = [...trades, ...deps, ...wds, ...rSettled, ...rVoided, ...bSettled, ...bRefund].filter(onTouched);
  const own = [...redeemed, ...claimed, ...disputes, ...rr, ...cr];
  await timesFor(pc, [...marketLogs, ...own].map((l) => l.blockNumber));
  const tOf = (l: AnyLog) => blockTimes.get(l.blockNumber) ?? 0;

  // Current positions by market id, for payouts and labels.
  const posById = new Map<string, Position>(portfolio.positions.map((p) => [p.kind === "binary" ? p.market.marketId : p.view.marketId, p]));
  const collectedBy = new Map<string, bigint>();
  for (const l of [...redeemed, ...claimed]) collectedBy.set(String(l.args.marketId), (collectedBy.get(String(l.args.marketId)) ?? 0n) + (l.args.amount as bigint));

  // --- replay ---
  type RangeState = { prices: number[]; shares: bigint[]; settledValue?: number };
  type BinState = { yesPool: bigint; noPool: bigint; yes: bigint; no: bigint; settledValue?: number };
  const rs = new Map<string, RangeState>();
  const bs = new Map<string, BinState>();
  const stats: Record<string, PositionStats> = {};
  const statFor = (id: string) => (stats[id] ??= { invested: 0n, collected: 0n, fees: 0n, spark: [], price: 0, outcome: "" });
  const items: ActivityItem[] = [];
  const history: HistoryPoint[] = [];
  let invested = 0;

  const nBuckets = (id: string) => {
    const p = posById.get(id);
    return p?.kind === "range" ? p.view.nBuckets : 0;
  };
  const finalPayout = (id: string) => f6((collectedBy.get(id) ?? 0n) + (posById.get(id)?.payout ?? 0n));
  const value = () => {
    let v = 0;
    rs.forEach((s) => (v += s.settledValue ?? s.shares.reduce((a, sh, b) => a + f6(sh) * (s.prices[b] ?? 0), 0)));
    bs.forEach((s) => (v += s.settledValue ?? f6(s.yes + s.no)));
    return v;
  };

  for (const l of [...marketLogs, ...own].sort(order)) {
    const id = String(l.args.marketId ?? "");
    const t = tOf(l);
    const isMine = l.args.trader !== undefined && mine(l);
    switch (l.eventName) {
      case "Trade": {
        const n = nBuckets(id) || (l.args.pricesAfter as readonly bigint[]).length;
        const s = rs.get(id) ?? { prices: Array(n).fill(1 / n), shares: Array(n).fill(0n) };
        s.prices = (l.args.pricesAfter as readonly bigint[]).map((p) => Number(p) / 1e18);
        if (isMine) {
          const b = Number(l.args.bucket);
          const sh = l.args.shares as bigint;
          const c = l.args.collateral as bigint;
          const st = statFor(id);
          s.shares[b] = (s.shares[b] ?? 0n) + (l.args.isBuy ? sh : -sh);
          st.invested += l.args.isBuy ? c : -c;
          st.fees += l.args.fee as bigint;
          invested += l.args.isBuy ? f6(c) : -f6(c);
          items.push({ kind: l.args.isBuy ? "buy" : "sell", marketId: id as Hex, bucket: b, amount: c, shares: sh, fee: l.args.fee as bigint, time: t, tx: l.transactionHash });
        }
        rs.set(id, s);
        if (stats[id]) {
          const top = s.shares.reduce((bi, v, i) => (v > (s.shares[bi] ?? 0n) ? i : bi), 0);
          stats[id].spark.push({ t, p: s.prices[top] ?? 0 });
        }
        break;
      }
      case "CollateralDeposited":
      case "PositionWithdrawn": {
        const s = bs.get(id) ?? { yesPool: 0n, noPool: 0n, yes: 0n, no: 0n };
        const a = l.args.amount as bigint;
        const sign = l.eventName === "CollateralDeposited" ? 1n : -1n;
        if (l.args.backingYes) s.yesPool += sign * a;
        else s.noPool += sign * a;
        if (isMine) {
          if (l.args.backingYes) s.yes += sign * a;
          else s.no += sign * a;
          statFor(id).invested += sign * a;
          invested += Number(sign) * f6(a);
          items.push({ kind: sign > 0n ? "deposit" : "withdraw", marketId: id as Hex, side: l.args.backingYes ? "YES" : "NO", amount: a, time: t, tx: l.transactionHash });
        }
        bs.set(id, s);
        if (stats[id]) {
          const total = s.yesPool + s.noPool;
          const pYes = total > 0n ? Number(s.yesPool) / Number(total) : 0.5;
          stats[id].spark.push({ t, p: s.yes >= s.no ? pYes : 1 - pYes });
        }
        break;
      }
      case "MarketSettled":
      case "MarketVoided":
      case "MarketRefunding": {
        const r = rs.get(id);
        const b = bs.get(id);
        if (r) r.settledValue = finalPayout(id);
        if (b) b.settledValue = finalPayout(id);
        break;
      }
      case "Redeemed":
      case "Claimed": {
        const a = l.args.amount as bigint;
        statFor(id).collected += a;
        invested -= f6(a);
        const r = rs.get(id);
        const b = bs.get(id);
        if (r) r.settledValue = Math.max(0, (r.settledValue ?? 0) - f6(a));
        if (b) b.settledValue = Math.max(0, (b.settledValue ?? 0) - f6(a));
        items.push({ kind: "collect", marketId: id as Hex, amount: a, time: t, tx: l.transactionHash });
        break;
      }
      case "DisputeFiled":
        items.push({ kind: "dispute", eventId: l.args.eventId as Hex, amount: l.args.bond as bigint, time: t, tx: l.transactionHash });
        break;
      case "ResolverRewardClaimed":
      case "CommitteeRewardClaimed":
        items.push({ kind: "reward", eventId: l.args.eventId as Hex, amount: l.args.amount as bigint, time: t, tx: l.transactionHash });
        break;
    }
    if (touched.has(id) || l.eventName === "Redeemed" || l.eventName === "Claimed") history.push({ t, value: value(), invested });
  }

  // "Now" point marked at today's prices, and current prices/labels for each position.
  for (const p of portfolio.positions) {
    const id = p.kind === "binary" ? p.market.marketId : p.view.marketId;
    const st = statFor(id);
    if (p.kind === "range") {
      const top = p.shares.reduce((bi, v, i) => (v > (p.shares[bi] ?? 0n) ? i : bi), 0);
      st.price = p.view.prices[top] ?? 0;
      st.outcome = p.view.labels[top] ?? `#${top}`;
      const r = rs.get(id);
      if (r && p.view.status === 0) r.prices = p.view.prices;
    } else {
      const total = p.market.yesPool + p.market.noPool;
      const pYes = total > 0n ? Number(p.market.yesPool) / Number(total) : 0.5;
      st.price = p.yes >= p.no ? pYes : 1 - pYes;
      st.outcome = p.yes >= p.no ? "YES" : "NO";
    }
    const now = Math.floor(Date.now() / 1000);
    if (st.spark.length === 0 || st.spark[st.spark.length - 1].t < now) st.spark.push({ t: now, p: st.price });
  }
  // "Now" = what the portfolio is actually worth: exit value of open range
  // positions, stake in open yes/no pools, payouts waiting to be collected.
  const nowValue = portfolio.positions.reduce((s, p) => {
    if (p.payout > 0n) return s + f6(p.payout);
    if (p.kind === "range") return s + (p.view.status === 0 ? f6(p.value) : 0);
    return s + (p.market.status === 0 ? f6(p.yes + p.no) : 0);
  }, 0);
  if (history.length) history.push({ t: Math.floor(Date.now() / 1000), value: nowValue, invested });

  const userTrades = trades.filter(mine);
  return {
    items: items.sort((a, b) => b.time - a.time),
    history,
    stats,
    feesPaid: userTrades.reduce((s, l) => s + (l.args.fee as bigint), 0n),
    disputesFiled: disputes.length,
    disputeBondsWei: disputes.reduce((s, l) => s + (l.args.bond as bigint), 0n),
    rewardsClaimed: [...rr, ...cr].reduce((s, l) => s + (l.args.amount as bigint), 0n),
  };
}

export function useActivity(who: Address | undefined, portfolio: Portfolio | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "activity", who, portfolio?.positions.length, portfolio?.claimableUsdg.toString()],
    enabled: Boolean(pc && who && deployment && portfolio),
    refetchInterval: 30_000,
    queryFn: () => load(pc as PublicClient, who!, portfolio!),
  });
}
