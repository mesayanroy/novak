"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { decodeEventLog, toEventSelector, type Address, type Log, type PublicClient } from "viem";
import { disputeManagerAbi, eventRegistryAbi, treasuryVaultAbi, type Hex } from "@novakoracle/sdk";
import { deployment } from "./addresses";
import { fetchLogsForEvents } from "./logs";

export interface ResolverStats {
  address: Address;
  label: string;
  ethBalance: bigint;
  ethOwed: bigint;
  observations: number;
  votes: number;
  resolverRewards: bigint; // USDG claimed (6 decimals)
  committeeRewards: bigint;
}

export interface NetworkStats {
  resolvers: ResolverStats[];
  treasuryUsdg: bigint;
  insuranceUsdg: bigint;
  vaultEth: bigint;
  /** Totals across every FeesAllocated (+ FeesToTreasury) — where fees actually went. */
  flow: { resolvers: bigint; committee: bigint; insurance: bigint; treasury: bigint };
  disputesFiled: number;
  eventsDecidedByCommittee: number;
}

const ev = (abi: readonly unknown[], name: string) =>
  (abi as { type: string; name: string }[]).find((x) => x.type === "event" && x.name === name)!;
async function scan(pc: PublicClient, address: Address, topics: Hex[]): Promise<Log[]> {
  return fetchLogsForEvents(pc, address, topics, BigInt(deployment!.startBlock));
}

async function loadNetwork(pc: PublicClient): Promise<NetworkStats> {
  const d = deployment!;
  const resolvers = [...((await pc.readContract({ address: d.eventRegistry, abi: eventRegistryAbi, functionName: "getAuthorizedResolvers" })) as readonly Address[])];

  const regEvents = [ev(eventRegistryAbi, "ObservationSubmitted")];
  const dmEvents = [ev(disputeManagerAbi, "TierVoteSubmitted"), ev(disputeManagerAbi, "DisputeFiled"), ev(disputeManagerAbi, "TierConverged")];
  const vEvents = ["FeesAllocated", "FeesToTreasury", "ResolverRewardClaimed", "CommitteeRewardClaimed"].map((n) => ev(treasuryVaultAbi, n));
  const sel = (xs: unknown[]) => xs.map((x) => toEventSelector(x as never));

  const [regLogs, dmLogs, vLogs] = await Promise.all([
    scan(pc, d.eventRegistry, sel(regEvents)),
    scan(pc, d.disputeManager, sel(dmEvents)),
    scan(pc, d.treasuryVault, sel(vEvents)),
  ]);
  const decode = (abi: readonly unknown[], l: Log) => {
    try {
      return decodeEventLog({ abi: abi as never, data: l.data, topics: l.topics as [Hex, ...Hex[]] }) as unknown as { eventName: string; args: Record<string, unknown> };
    } catch {
      return null;
    }
  };

  const key = (a: unknown) => String(a).toLowerCase();
  const obs = new Map<string, number>();
  const votes = new Map<string, number>();
  const rRew = new Map<string, bigint>();
  const cRew = new Map<string, bigint>();
  const flow = { resolvers: 0n, committee: 0n, insurance: 0n, treasury: 0n };
  let disputesFiled = 0;
  let converged = 0;

  for (const l of regLogs) {
    const e = decode(eventRegistryAbi, l);
    if (e?.eventName === "ObservationSubmitted") obs.set(key(e.args.resolver), (obs.get(key(e.args.resolver)) ?? 0) + 1);
  }
  for (const l of dmLogs) {
    const e = decode(disputeManagerAbi, l);
    if (e?.eventName === "TierVoteSubmitted") votes.set(key(e.args.member), (votes.get(key(e.args.member)) ?? 0) + 1);
    if (e?.eventName === "DisputeFiled") disputesFiled++;
    if (e?.eventName === "TierConverged") converged++;
  }
  for (const l of vLogs) {
    const e = decode(treasuryVaultAbi, l);
    if (!e) continue;
    const a = e.args;
    if (e.eventName === "FeesAllocated") {
      flow.resolvers += a.resolverShare as bigint;
      flow.committee += a.committeeShare as bigint;
      flow.insurance += a.insuranceShare as bigint;
      flow.treasury += a.treasuryShare as bigint;
    } else if (e.eventName === "FeesToTreasury") flow.treasury += a.amount as bigint;
    else if (e.eventName === "ResolverRewardClaimed") rRew.set(key(a.resolver), (rRew.get(key(a.resolver)) ?? 0n) + (a.amount as bigint));
    else if (e.eventName === "CommitteeRewardClaimed") cRew.set(key(a.member), (cRew.get(key(a.member)) ?? 0n) + (a.amount as bigint));
  }

  const per = await pc.multicall({
    allowFailure: false,
    contracts: resolvers.map((r) => ({ address: d.disputeManager, abi: disputeManagerAbi, functionName: "pendingWithdrawals" as const, args: [r] as const })),
  });
  const balances = await Promise.all(resolvers.map((r) => pc.getBalance({ address: r })));
  const [treasuryUsdg, insuranceUsdg] = (await pc.multicall({
    allowFailure: false,
    contracts: [
      { address: d.treasuryVault, abi: treasuryVaultAbi, functionName: "treasuryBalance" },
      { address: d.treasuryVault, abi: treasuryVaultAbi, functionName: "insuranceReserve" },
    ],
  })) as bigint[];
  const vaultEth = await pc.getBalance({ address: d.treasuryVault });

  return {
    resolvers: resolvers.map((a, i) => ({
      address: a,
      label: `r${i + 1}`,
      ethBalance: balances[i],
      ethOwed: per[i] as bigint,
      observations: obs.get(key(a)) ?? 0,
      votes: votes.get(key(a)) ?? 0,
      resolverRewards: rRew.get(key(a)) ?? 0n,
      committeeRewards: cRew.get(key(a)) ?? 0n,
    })),
    treasuryUsdg,
    insuranceUsdg,
    vaultEth,
    flow,
    disputesFiled,
    eventsDecidedByCommittee: converged,
  };
}

export function useNetworkStats() {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "network", deployment?.eventRegistry],
    enabled: Boolean(pc && deployment?.treasuryVault),
    refetchInterval: 20_000,
    queryFn: () => loadNetwork(pc as PublicClient),
  });
}
