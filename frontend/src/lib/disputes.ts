"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { decodeOutcome, disputeManagerAbi, EventStatus, eventRegistryAbi, type Hex } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";

/**
 * Everything the Dispute Center shows about ONE primitive event, read straight
 * from the protocol contracts (EventRegistry + DisputeManager) in a single
 * multicall. This is protocol UI — the dispute ladder itself — not a consumer
 * read path, so it talks to the Registry/DisputeManager directly; markets still
 * settle only through Settlement → EventBus.
 */

export enum VoteChoice {
  NotVoted = 0,
  VotedTrue = 1,
  VotedFalse = 2,
}

export interface ResolverView {
  address: Address;
  label: string; // r1, r2, r3 … (authorization order)
  submitted: boolean;
  outcome: boolean;
}

export interface TierView {
  tier: 1 | 2;
  committee: { address: Address; label: string; vote: VoteChoice }[];
  trueVotes: number;
  falseVotes: number;
  /** Votes either side needs: smallest v with v*100 >= size*66 (the contract's rule). */
  needed: number;
  deadline: number;
  bond: bigint;
}

export interface DisputeState {
  eventId: Hex;
  status: EventStatus;
  disputeWindowSeconds: number;
  observationDeadline: number;
  quorumThreshold: number;
  proposedOutcome?: boolean;
  proposedAt?: number;
  /** End of the dispute window (only while a proposal exists). */
  windowEndsAt?: number;
  finalOutcome?: boolean;
  resolvers: ResolverView[];
  caseExists: boolean;
  caseResolved: boolean;
  activeTier: number;
  hasOriginalProposal: boolean;
  tiers: TierView[];
  disputeBond: bigint;
  tier1Bond: bigint;
  tier2Bond: bigint;
  /** Commit-reveal draw of the active tier (only when the pool is larger than the committee). */
  seed?: { seeding: boolean; commitDeadline: number; revealDeadline: number; commits: number; reveals: number };
}

const AGREEMENT = 66;
export const votesNeeded = (size: number) => {
  for (let v = 1; v <= size; v++) if (v * 100 >= size * AGREEMENT) return v;
  return size;
};

async function loadDisputeState(pc: PublicClient, eventId: Hex): Promise<DisputeState> {
  const reg = { address: novakAddresses.eventRegistry, abi: eventRegistryAbi } as const;
  const dm = { address: deployment!.disputeManager, abi: disputeManagerAbi } as const;

  const [status, spec, proposal, resolvers, summary, disputeBond, tier1Bond, tier2Bond] = await pc.multicall({
    allowFailure: false,
    contracts: [
      { ...reg, functionName: "getEvent", args: [eventId] },
      { ...reg, functionName: "getEventSpec", args: [eventId] },
      { ...reg, functionName: "getProposal", args: [eventId] },
      { ...reg, functionName: "getAuthorizedResolvers" },
      { ...dm, functionName: "getCaseSummary", args: [eventId] },
      { ...dm, functionName: "DISPUTE_BOND" },
      { ...dm, functionName: "TIER1_BOND" },
      { ...dm, functionName: "TIER2_BOND" },
    ],
  });

  const resolverList = resolvers as readonly Address[];
  const labelOf = (a: Address) => {
    const i = resolverList.findIndex((r) => r.toLowerCase() === a.toLowerCase());
    return i >= 0 ? `r${i + 1}` : `${a.slice(0, 6)}…${a.slice(-4)}`;
  };
  const [exists, resolved, tier, hasOriginalProposal] = summary as readonly [boolean, boolean, number, boolean];
  const st = Number(status) as EventStatus;

  const observed = await pc.multicall({
    allowFailure: false,
    contracts: resolverList.map((r) => ({ ...reg, functionName: "observedOutcome" as const, args: [eventId, r] as const })),
  });

  const tiers: TierView[] = [];
  if (exists) {
    for (const t of [1, 2] as const) {
      if (t > Number(tier)) break;
      const [committee, tally] = await pc.multicall({
        allowFailure: false,
        contracts: [
          { ...dm, functionName: "getCommittee", args: [eventId, t] },
          { ...dm, functionName: "getTierTally", args: [eventId, t] },
        ],
      });
      const members = committee as readonly Address[];
      if (members.length === 0) continue; // still drawing (commit-reveal)
      const votes = members.length
        ? await pc.multicall({
            allowFailure: false,
            contracts: members.map((m) => ({ ...dm, functionName: "getVote" as const, args: [eventId, t, m] as const })),
          })
        : [];
      const [trueVotes, falseVotes, deadline, bond] = tally as readonly [bigint, bigint, bigint, bigint];
      tiers.push({
        tier: t,
        committee: members.map((m, i) => ({ address: m, label: labelOf(m), vote: Number(votes[i]) as VoteChoice })),
        trueVotes: Number(trueVotes),
        falseVotes: Number(falseVotes),
        needed: votesNeeded(members.length),
        deadline: Number(deadline),
        bond,
      });
    }
  }

  let seed: DisputeState["seed"];
  if (exists) {
    const st = (await pc.readContract({ ...dm, functionName: "getSeedState", args: [eventId, Number(tier)] })) as readonly [boolean, bigint, bigint, number, number, boolean];
    if (st[0]) seed = { seeding: true, commitDeadline: Number(st[1]), revealDeadline: Number(st[2]), commits: Number(st[3]), reveals: Number(st[4]) };
  }

  const p = proposal as readonly [Hex, Hex, bigint];
  const sp = spec as { disputeWindowSeconds: bigint; observationDeadline: bigint; quorumThreshold: number };
  const proposedAt = Number(p[2]);
  let finalOutcome: boolean | undefined;
  if (st === EventStatus.Finalized) {
    const o = (await pc.readContract({ ...reg, functionName: "getOutcome", args: [eventId] })) as { outcomeData: Hex };
    finalOutcome = decodeOutcome(o.outcomeData).outcome;
  }

  return {
    eventId,
    status: st,
    disputeWindowSeconds: Number(sp.disputeWindowSeconds),
    observationDeadline: Number(sp.observationDeadline),
    quorumThreshold: Number(sp.quorumThreshold),
    proposedOutcome: proposedAt ? decodeOutcome(p[1]).outcome : undefined,
    proposedAt: proposedAt || undefined,
    windowEndsAt: proposedAt ? proposedAt + Number(sp.disputeWindowSeconds) : undefined,
    finalOutcome,
    resolvers: resolverList.map((a, i) => {
      const [submitted, outcome] = observed[i] as readonly [boolean, boolean];
      return { address: a, label: `r${i + 1}`, submitted, outcome };
    }),
    caseExists: exists,
    caseResolved: resolved,
    activeTier: Number(tier),
    hasOriginalProposal,
    tiers,
    disputeBond: disputeBond as bigint,
    tier1Bond: tier1Bond as bigint,
    tier2Bond: tier2Bond as bigint,
    seed,
  };
}

export function useDisputeState(eventId: Hex | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "dispute", eventId],
    enabled: Boolean(eventId && pc && deployment?.disputeManager),
    refetchInterval: 5_000,
    queryFn: () => loadDisputeState(pc as PublicClient, eventId!),
  });
}

/** ETH the DisputeManager owes `who` (returned bonds + rewards), pull-based. */
export function usePendingWithdrawal(who: Address | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "pendingWithdrawal", who],
    enabled: Boolean(who && pc && deployment?.disputeManager),
    refetchInterval: 10_000,
    queryFn: async () =>
      (await pc!.readContract({
        address: deployment!.disputeManager,
        abi: disputeManagerAbi,
        functionName: "pendingWithdrawals",
        args: [who!],
      })) as bigint,
  });
}

/** Same salt a resolver node derives (resolver/node/voter.ts): hash of a signature over a fixed message. */
export const seedMessage = (eventId: Hex, tier: number) =>
  `novak-committee-seed:${deployment?.chainId}:${deployment?.disputeManager.toLowerCase()}:${eventId.toLowerCase()}:${tier}`;
