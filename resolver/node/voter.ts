import { encodeAbiParameters, keccak256, parseAbiParameters, type Abi, type Hex } from "viem";
import { EventStatus, disputeManagerAbi, eventRegistryAbi } from "@novakoracle/sdk";
import type { SourceAdapter } from "../adapters/types.js";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";
import type { ResolverDuty } from "./resolve.js";

/**
 * Commit-reveal salt for (eventId, tier): the hash of this node's signature
 * over a fixed message. Unpredictable to everyone else until revealed, yet
 * reproducible by this node after a restart — no secret to store or lose.
 */
export async function committeeSalt(c: Clients, eventId: Hex, tier: number): Promise<Hex> {
  const message = `novak-committee-seed:${c.deployment.chainId}:${c.deployment.disputeManager.toLowerCase()}:${eventId.toLowerCase()}:${tier}`;
  return keccak256(await c.account.signMessage({ message }));
}

export const seedCommitment = (eventId: Hex, tier: number, resolver: Hex, salt: Hex) =>
  keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint8, address, bytes32"), [eventId, tier, resolver, salt]));

/**
 * Dispute-committee duty (closes the "daemon doesn't drive DisputeManager"
 * gap): for every Disputed event, if this resolver was drawn onto the active
 * tier's committee and hasn't voted, it re-observes the source with the same
 * adapter and votes, posting the tier bond. Committees vote on the boolean
 * only (see docs/protocol-spec.md). Abstains when its adapter abstains.
 * When the pool is larger than the committee, it first takes part in the
 * commit-reveal draw: commit its salt during the commit window, reveal it
 * during the reveal window (the keeper then calls drawCommittee).
 */
export class VoterDuty {
  private readonly voted = new Set<string>();
  private readonly committed = new Set<string>();
  private readonly revealed = new Set<string>();
  votes = 0;
  seedActions = 0;

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

      await this.seedTick(eventId, now);

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

  /** Commit-reveal participation for the active tier, if it is seeding. */
  private async seedTick(eventId: Hex, now: bigint): Promise<void> {
    const dm = this.c.deployment.disputeManager;
    const [, , tierRaw] = (await this.c.publicClient.readContract({
      address: dm,
      abi: disputeManagerAbi,
      functionName: "getCaseSummary",
      args: [eventId],
    })) as readonly [boolean, boolean, number, boolean];
    const tier = Number(tierRaw);
    const [seeding, commitDeadline, revealDeadline] = (await this.c.publicClient.readContract({
      address: dm,
      abi: disputeManagerAbi,
      functionName: "getSeedState",
      args: [eventId, tier],
    })) as readonly [boolean, bigint, bigint, number, number, boolean];
    if (!seeding) return;

    const key = `${eventId}:${tier}`;
    const salt = await committeeSalt(this.c, eventId, tier);
    if (now < commitDeadline && !this.committed.has(key)) {
      const res = await send(this.c, {
        address: dm,
        abi: disputeManagerAbi as Abi,
        functionName: "commitSeed",
        args: [eventId, seedCommitment(eventId, tier, this.c.account.address, salt)],
      });
      if (res.ok || /already committed/.test(res.reason)) this.committed.add(key);
      if (res.ok) {
        this.seedActions++;
        this.log.info(`committed seed tier${tier} ${eventId} tx=${res.hash}`);
      }
    } else if (now >= commitDeadline && now < revealDeadline && !this.revealed.has(key)) {
      const res = await send(this.c, { address: dm, abi: disputeManagerAbi as Abi, functionName: "revealSeed", args: [eventId, salt] });
      // "does not match" = this node never committed for this tier: nothing to reveal.
      if (res.ok || /already revealed|does not match/.test(res.reason)) this.revealed.add(key);
      if (res.ok) {
        this.seedActions++;
        this.log.info(`revealed seed tier${tier} ${eventId} tx=${res.hash}`);
      }
    }
  }
}
