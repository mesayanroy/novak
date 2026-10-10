"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { EventStatus, eventRegistryAbi, type Hex } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";
import type { EventNode } from "./novak";

/**
 * Where a market's resolution actually is, read from the Registry for every
 * primitive event it settles on (a range market's boundaries, a composite's
 * leaves): who has reported, when the outcome was proposed, when the dispute
 * window ends, when it was finalized. Protocol UI, so it reads the Registry
 * directly; markets themselves still settle only through the EventBus.
 */

export interface EventProgress {
  id: Hex;
  status: EventStatus;
  openAt: number;
  deadline: number;
  windowS: number;
  quorum: number;
  reported: number;
  proposedAt?: number;
  finalizedAt?: number;
}

export interface Resolution {
  events: EventProgress[];
  resolvers: number;
  /** T: when the price / fact is read (latest openTimestamp). */
  readAt: number;
  /** Earliest observation deadline: after it, an unobserved event can only expire (refund). */
  deadline: number;
  windowS: number;
  quorum: number;
  /** Fewest reports any event has so far. */
  reported: number;
  allProposed: boolean;
  proposedAt?: number;
  windowEndsAt?: number;
  allFinal: boolean;
  finalizedAt?: number;
  disputed: boolean;
  voided: boolean;
  /** Some event got no quorum before its observation deadline (Expired). */
  expired: boolean;
}

export function leafIds(nodes: EventNode[]): Hex[] {
  const out: Hex[] = [];
  const walk = (n: EventNode) => (n.kind === "primitive" ? out.push(n.id) : n.children?.forEach(walk));
  nodes.forEach(walk);
  return [...new Set(out)];
}

const TERMINAL = new Set([EventStatus.Finalized, EventStatus.Voided, EventStatus.Expired]);

async function load(pc: PublicClient, ids: Hex[]): Promise<Resolution> {
  const reg = { address: novakAddresses.eventRegistry, abi: eventRegistryAbi } as const;
  const resolvers = (await pc.readContract({ ...reg, functionName: "getAuthorizedResolvers" })) as readonly Address[];
  const base = await pc.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => [
      { ...reg, functionName: "getEvent" as const, args: [id] as const },
      { ...reg, functionName: "getEventSpec" as const, args: [id] as const },
      { ...reg, functionName: "getProposal" as const, args: [id] as const },
      { ...reg, functionName: "getOutcome" as const, args: [id] as const },
    ]),
  });
  const obs = await pc.multicall({
    allowFailure: false,
    contracts: ids.flatMap((id) => resolvers.map((r) => ({ ...reg, functionName: "observedOutcome" as const, args: [id, r] as const }))),
  });

  const events: EventProgress[] = ids.map((id, i) => {
    const status = Number(base[i * 4]) as EventStatus;
    const spec = base[i * 4 + 1] as { openTimestamp: bigint; observationDeadline: bigint; disputeWindowSeconds: bigint; quorumThreshold: number };
    const proposal = base[i * 4 + 2] as readonly [Hex, Hex, bigint];
    const outcome = base[i * 4 + 3] as { exists: boolean; finalizedAt: bigint };
    const reported = resolvers.filter((_, k) => (obs[i * resolvers.length + k] as readonly [boolean, boolean])[0]).length;
    return {
      id,
      status,
      openAt: Number(spec.openTimestamp),
      deadline: Number(spec.observationDeadline),
      windowS: Number(spec.disputeWindowSeconds),
      quorum: Number(spec.quorumThreshold),
      reported,
      proposedAt: Number(proposal[2]) || undefined,
      finalizedAt: outcome.exists ? Number(outcome.finalizedAt) || undefined : undefined,
    };
  });

  const maxOf = (xs: (number | undefined)[]) => (xs.every((x) => x !== undefined) && xs.length ? Math.max(...(xs as number[])) : undefined);
  const expired = events.some((e) => e.status === EventStatus.Expired);
  const allProposed = !expired && events.every((e) => e.proposedAt !== undefined || TERMINAL.has(e.status));
  const proposedAt = allProposed ? maxOf(events.map((e) => e.proposedAt ?? e.finalizedAt ?? e.openAt)) : undefined;
  return {
    events,
    resolvers: resolvers.length,
    readAt: Math.max(...events.map((e) => e.openAt)),
    deadline: Math.min(...events.map((e) => e.deadline)),
    windowS: Math.max(...events.map((e) => e.windowS)),
    quorum: Math.max(...events.map((e) => e.quorum)),
    reported: Math.min(...events.map((e) => (TERMINAL.has(e.status) || e.proposedAt ? e.quorum : e.reported))),
    allProposed,
    proposedAt,
    windowEndsAt: allProposed ? maxOf(events.map((e) => (e.proposedAt ? e.proposedAt + e.windowS : (e.finalizedAt ?? e.openAt)))) : undefined,
    allFinal: events.every((e) => TERMINAL.has(e.status)),
    finalizedAt: events.every((e) => e.finalizedAt) ? Math.max(...events.map((e) => e.finalizedAt!)) : undefined,
    disputed: events.some((e) => e.status === EventStatus.Disputed),
    voided: events.some((e) => e.status === EventStatus.Voided || e.status === EventStatus.Expired),
    expired,
  };
}

export function useResolution(nodes: EventNode[] | undefined) {
  const pc = usePublicClient();
  const ids = nodes ? leafIds(nodes) : [];
  return useQuery({
    queryKey: ["novak", "resolution", ids.join(",")],
    enabled: Boolean(pc && deployment && ids.length),
    refetchInterval: 10_000,
    queryFn: () => load(pc as PublicClient, ids),
  });
}
