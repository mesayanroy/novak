import type { Abi, Hex } from "viem";
import { disputeManagerAbi, EventStatus, eventRegistryAbi, treasuryVaultAbi } from "@novakoracle/sdk";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";

/**
 * Rewards duty (every resolver): claims this node's share of the
 * TreasuryVault's per-event thirds —
 *   - the resolver third, for events where it reported the final outcome;
 *   - the committee third, for disputes where it voted with the decision.
 * Also withdraws whatever the DisputeManager credited this node (returned
 * committee bonds + its share of losing bonds) — every node, not just the keeper.
 * Claims also run the vault's `allocate`, so pending fees are split on the
 * first claim. Pull-based: nothing is pushed to resolvers.
 */
export class RewardsDuty {
  private readonly checked = new Map<Hex, number>(); // eventId -> last pendingFees seen (as number) to avoid re-simulating
  claims = 0;

  constructor(
    private readonly c: Clients,
    private readonly index: EventIndex,
    private readonly log: Log,
  ) {}

  async tick(): Promise<void> {
    await this.withdrawDisputeCredits();
    const vault = this.c.deployment.treasuryVault;
    if (!vault) return;
    const me = this.c.account.address;

    for (const eventId of this.index.primitives.keys()) {
      const status = Number(
        await this.c.publicClient.readContract({
          address: this.c.deployment.eventRegistry,
          abi: eventRegistryAbi,
          functionName: "getEvent",
          args: [eventId],
        }),
      );
      if (status !== EventStatus.Finalized) continue;

      const [pending, resolverClaimable, committeeClaimable] = await Promise.all([
        this.read<bigint>(vault, "pendingFees", [eventId]),
        this.read<bigint>(vault, "claimableResolverReward", [eventId, me]),
        this.read<bigint>(vault, "claimableCommitteeReward", [eventId, me]),
      ]);
      const fingerprint = Number(pending) + Number(resolverClaimable) + Number(committeeClaimable);
      if (fingerprint === 0 || this.checked.get(eventId) === fingerprint) continue;
      this.checked.set(eventId, fingerprint);

      for (const fn of ["claimResolverReward", "claimCommitteeReward"] as const) {
        const res = await send(this.c, { address: vault, abi: treasuryVaultAbi as Abi, functionName: fn, args: [eventId] });
        if (res.ok) {
          this.claims++;
          this.log.info(`rewards ${fn} ${eventId} tx=${res.hash}`);
        }
      }
    }
  }

  private read<T>(address: Hex, functionName: string, args: readonly unknown[]): Promise<T> {
    return this.c.publicClient.readContract({ address, abi: treasuryVaultAbi as Abi, functionName, args }) as Promise<T>;
  }

  private async withdrawDisputeCredits(): Promise<void> {
    const dm = this.c.deployment.disputeManager;
    if (!dm) return;
    const owed = (await this.c.publicClient.readContract({
      address: dm,
      abi: disputeManagerAbi,
      functionName: "pendingWithdrawals",
      args: [this.c.account.address],
    })) as bigint;
    if (owed === 0n) return;
    const res = await send(this.c, { address: dm, abi: disputeManagerAbi as Abi, functionName: "withdraw", args: [] });
    if (res.ok) {
      this.claims++;
      this.log.info(`withdrew ${owed} wei of dispute credits tx=${res.hash}`);
    }
  }
}
