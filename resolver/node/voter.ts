import type { Abi, Hex } from "viem";
import { EventStatus, disputeManagerAbi, eventRegistryAbi } from "@novak/sdk";
import type { SourceAdapter } from "../adapters/types.js";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";
import type { ResolverDuty } from "./resolve.js";

/**
 * Dispute-committee duty (closes the "daemon doesn't drive DisputeManager"
 * gap): for every Disputed event, if this resolver was drawn onto the active
 * tier's committee and hasn't voted, it re-observes the source with the same
 * adapter and votes, posting the tier bond. Committees vote on the boolean
 * only (see docs/protocol-spec.md). Abstains when its adapter abstains.
 */
export class VoterDuty {
  private readonly voted = new Set<string>();
  votes = 0;

  constructor(
    private readonly c: Clients,
    private readonly index: EventIndex,
    private readonly adapters: Map<Hex, SourceAdapter>,
    private readonly resolver: ResolverDuty,
    private readonly log: Log,
  ) {}

  async tick(now: bigint): Promise<void> {
    const d = this.c.deployment;
    const me = this.c.account.address.toLowerCase();

    for (const [eventId, meta] of this.index.primitives) {
      const adapter = this.adapters.get(meta.sourceId);
      if (!adapter) continue;
      const status = Number(
        await this.c.publicClient.readContract({
          address: d.eventRegistry,
          abi: eventRegistryAbi,
          functionName: "getEvent",
          args: [eventId],
        }),
      );
      if (status !== EventStatus.Disputed) continue;

      for (const tier of [2, 1] as const) {
        const key = `${eventId}:${tier}`;
        if (this.voted.has(key)) continue;
        const [, , deadline, bond] = (await this.c.publicClient.readContract({
          address: d.disputeManager,
          abi: disputeManagerAbi,
          functionName: "getTierTally",
          args: [eventId, tier],
        })) as readonly [bigint, bigint, bigint, bigint];
        if (deadline === 0n || now >= deadline) continue;

        const committee = (await this.c.publicClient.readContract({
          address: d.disputeManager,
          abi: disputeManagerAbi,
          functionName: "getCommittee",
          args: [eventId, tier],
        })) as readonly Hex[];
        if (!committee.some((m) => m.toLowerCase() === me)) continue;

        const spec = await this.resolver.spec(eventId);
        const obs = await adapter.observe({ eventId, spec, now }).catch(() => null);
        if (!obs) continue;

        const res = await send(this.c, {
          address: d.disputeManager,
          abi: disputeManagerAbi as Abi,
          functionName: tier === 1 ? "submitTier1Vote" : "submitTier2Vote",
          args: [eventId, obs.outcome],
          value: bond,
        });
        if (res.ok || /already voted|not in this tier/.test(res.reason)) this.voted.add(key);
        if (res.ok) {
          this.votes++;
          this.log.info(`voted tier${tier} ${eventId} outcome=${obs.outcome} bond=${bond} tx=${res.hash}`);
        } else {
          this.log.warn(`tier${tier} vote failed ${eventId}: ${res.reason}`);
        }
      }
    }
  }
}
