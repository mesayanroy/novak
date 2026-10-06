"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { DistributionStatus, disputeManagerAbi, distributionMarketAbi, marketAbi, MarketStatus } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";
import { useMarkets, type LiveMarket } from "./novak";
import { useDistributionMarkets, type DistributionView } from "./distribution";

export interface BinaryPosition {
  kind: "binary";
  market: LiveMarket;
  yes: bigint;
  no: bigint;
  claimed: boolean;
  payout: bigint;
  /** What you'd receive if your side wins, at current pools (parimutuel, before fee). */
  ifYes: bigint;
  ifNo: bigint;
}

export interface RangePosition {
  kind: "range";
  view: DistributionView;
  shares: bigint[];
  redeemed: boolean;
  payout: bigint;
  /** Mark-to-market: Σ shares × current LMSR price (USDG, 6 decimals). */
  value: bigint;
}

export type Position = BinaryPosition | RangePosition;

export interface Portfolio {
  positions: Position[];
  claimable: Position[];
  open: Position[];
  closed: Position[];
  claimableUsdg: bigint;
  openValueUsdg: bigint;
  disputeEthOwed: bigint;
}

const parimutuel = (mine: bigint, side: bigint, other: bigint) => (side === 0n ? 0n : mine + (mine * other) / side);

async function load(pc: PublicClient, who: Address, markets: LiveMarket[], dists: DistributionView[]): Promise<Portfolio> {
  const live = markets.filter((m) => !m.isExample);
  const bin = live.length
    ? await pc.multicall({
        allowFailure: false,
        contracts: live.flatMap((m) => [
          { address: novakAddresses.market, abi: marketAbi, functionName: "yesBalance" as const, args: [m.marketId, who] as const },
          { address: novakAddresses.market, abi: marketAbi, functionName: "noBalance" as const, args: [m.marketId, who] as const },
          { address: novakAddresses.market, abi: marketAbi, functionName: "claimed" as const, args: [m.marketId, who] as const },
          { address: novakAddresses.market, abi: marketAbi, functionName: "payoutOf" as const, args: [m.marketId, who] as const },
        ]),
      })
    : [];
  const dm = novakAddresses.distributionMarket;
  const rng = dm && dists.length
    ? await pc.multicall({
        allowFailure: false,
        contracts: dists.flatMap((d) => [
          { address: dm, abi: distributionMarketAbi, functionName: "sharesOf" as const, args: [d.marketId, who] as const },
          { address: dm, abi: distributionMarketAbi, functionName: "redeemed" as const, args: [d.marketId, who] as const },
          { address: dm, abi: distributionMarketAbi, functionName: "payoutOf" as const, args: [d.marketId, who] as const },
        ]),
      })
    : [];
  const disputeEthOwed = deployment?.disputeManager
    ? ((await pc.readContract({ address: deployment.disputeManager, abi: disputeManagerAbi, functionName: "pendingWithdrawals", args: [who] })) as bigint)
    : 0n;

  const positions: Position[] = [];
  live.forEach((m, i) => {
    const [yes, no, claimed, payout] = bin.slice(i * 4, i * 4 + 4) as [bigint, bigint, boolean, bigint];
    if (yes === 0n && no === 0n) return;
    positions.push({
      kind: "binary",
      market: m,
      yes,
      no,
      claimed,
      payout,
      ifYes: parimutuel(yes, m.yesPool, m.noPool),
      ifNo: parimutuel(no, m.noPool, m.yesPool),
    });
  });
  dists.forEach((d, i) => {
    const [sharesRaw, redeemed, payout] = rng.slice(i * 3, i * 3 + 3) as [readonly bigint[], boolean, bigint];
    const shares = [...sharesRaw];
    if (!shares.some((s) => s > 0n)) return;
    const value = shares.reduce((sum, s, b) => sum + BigInt(Math.round(Number(s) * (d.prices[b] ?? 0))), 0n);
    positions.push({ kind: "range", view: d, shares, redeemed, payout, value });
  });

  const isOpen = (p: Position) => (p.kind === "binary" ? p.market.status === MarketStatus.Open : p.view.status === DistributionStatus.Open);
  const claimable = positions.filter((p) => p.payout > 0n);
  const open = positions.filter((p) => isOpen(p));
  const closed = positions.filter((p) => !isOpen(p) && p.payout === 0n);
  return {
    positions,
    claimable,
    open,
    closed,
    claimableUsdg: claimable.reduce((s, p) => s + p.payout, 0n),
    openValueUsdg: open.reduce((s, p) => s + (p.kind === "range" ? p.value : p.yes + p.no), 0n),
    disputeEthOwed,
  };
}

export function usePortfolio(who: Address | undefined) {
  const pc = usePublicClient();
  const { data: markets } = useMarkets();
  const { data: dists } = useDistributionMarkets();
  return useQuery({
    queryKey: ["novak", "portfolio", who, markets?.length, dists?.length],
    enabled: Boolean(pc && who && deployment && markets && dists),
    refetchInterval: 10_000,
    queryFn: () => load(pc as PublicClient, who!, markets!, dists!),
  });
}
