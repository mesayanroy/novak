import type { Abi, Hex } from "viem";
import {
  Availability,
  EventStatus,
  MarketStatus,
  disputeManagerAbi,
  distributionMarketAbi,
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  marketAbi,
  treasuryVaultAbi,
} from "@novakoracle/sdk";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";
import type { ResolverDuty } from "./resolve.js";

const TERMINAL = new Set([EventStatus.Finalized, EventStatus.Voided, EventStatus.Expired]);

/**
 * Keeper: pokes every PERMISSIONLESS state transition as soon as it becomes
 * valid, so a demo (or a user) never has to click "finalize" / "resolve" /
 * "settle" by hand:
 *   - Registry: finalize (dispute window over), expire (nobody observed)
 *   - DisputeManager: escalateNonConvergence, drawCommittee (commit-reveal), escalateTier2, voidAfterTier2Timeout
 *   - Composer: tryResolve when an operand's state changed
 *   - Market: settle once the Bus reports Available/Voided
 *
 * This is NOT push delivery to consumers (deferred Issue #13): consumers
 * still pull from the Bus. It only calls functions anyone may call.
 */
export class KeeperDuty {
  private readonly terminal = new Set<Hex>();
  private readonly compositeFingerprint = new Map<Hex, string>();
  actions = 0;

  constructor(
    private readonly c: Clients,
    private readonly index: EventIndex,
    private readonly resolver: ResolverDuty,
    private readonly log: Log,
  ) {}

  private read<T>(address: Hex, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.c.publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;
  }

  private async poke(label: string, address: Hex, abi: Abi, functionName: string, args: readonly unknown[]) {
    const res = await send(this.c, { address, abi, functionName, args });
    if (res.ok) {
      this.actions++;
      this.log.info(`keeper ${label} tx=${res.hash}`);
    }
    return res.ok;
  }

  async tick(now: bigint): Promise<void> {
    const d = this.c.deployment;

    for (const eventId of this.index.primitives.keys()) {
      if (this.terminal.has(eventId)) continue;
      const status = Number(await this.read<number>(d.eventRegistry, eventRegistryAbi as Abi, "getEvent", [eventId]));
      if (TERMINAL.has(status)) {
        this.terminal.add(eventId);
        continue;
      }
      const spec = await this.resolver.spec(eventId);

      if (status === EventStatus.Open && now > spec.observationDeadline) {
        await this.poke(`expire ${eventId}`, d.eventRegistry, eventRegistryAbi as Abi, "expire", [eventId]);
      } else if (status === EventStatus.ObservationsSubmitted && now > spec.observationDeadline) {
        await this.poke(`escalateNonConvergence ${eventId}`, d.disputeManager, disputeManagerAbi as Abi, "escalateNonConvergence", [eventId]);
      } else if (status === EventStatus.ProposedOutcome) {
        const [, , proposedAt] = await this.read<[Hex, Hex, bigint]>(d.eventRegistry, eventRegistryAbi as Abi, "getProposal", [eventId]);
        if (now >= proposedAt + spec.disputeWindowSeconds) {
          await this.poke(`finalize ${eventId}`, d.eventRegistry, eventRegistryAbi as Abi, "finalize", [eventId]);
        }
      } else if (status === EventStatus.Disputed) {
        const dm = d.disputeManager;
        const [, , tier] = await this.read<[boolean, boolean, number, boolean]>(dm, disputeManagerAbi as Abi, "getCaseSummary", [eventId]);
        const [seeding, commitDeadline, revealDeadline, commits, reveals] = await this.read<[boolean, bigint, bigint, number, number, boolean]>(
          dm,
          disputeManagerAbi as Abi,
          "getSeedState",
          [eventId, tier],
        );
        if (seeding) {
          // Large pool: draw the committee as soon as commit-reveal allows it.
          const everyoneRevealed = Number(commits) > 0 && Number(reveals) === Number(commits) && now >= commitDeadline;
          if (now >= revealDeadline || everyoneRevealed) {
            await this.poke(`drawCommittee ${eventId} tier${tier}`, dm, disputeManagerAbi as Abi, "drawCommittee", [eventId]);
          }
        } else {
          const [, , deadline] = await this.read<[bigint, bigint, bigint, bigint]>(dm, disputeManagerAbi as Abi, "getTierTally", [eventId, tier]);
          if (deadline !== 0n && now >= deadline) {
            if (Number(tier) === 1) await this.poke(`escalateTier2 ${eventId}`, dm, disputeManagerAbi as Abi, "escalateTier2", [eventId]);
            else await this.poke(`voidAfterTier2Timeout ${eventId}`, dm, disputeManagerAbi as Abi, "voidAfterTier2Timeout", [eventId]);
          }
        }
      }
    }

    for (const [compositeId, { operands }] of this.index.composites) {
      const status = Number(await this.read<number>(d.eventComposer, eventComposerAbi as Abi, "getStatus", [compositeId]));
      if (status !== 0) continue; // already resolved or voided (cached forever)
      const avail = await Promise.all(
        operands.map((o) => this.read<number>(d.eventBus, eventBusAbi as Abi, "getAvailability", [o])),
      );
      const fp = avail.join(",");
      if (fp === this.compositeFingerprint.get(compositeId)) continue;
      this.compositeFingerprint.set(compositeId, fp);
      if (avail.every((a) => Number(a) === Availability.Pending)) continue;
      // Only spend a tx when it changes state: the simulated call resolves,
      // or an operand is Voided (tryResolve returns (false,false) for both
      // "still pending" and "voided", so the Voided case is checked here).
      const anyVoided = avail.some((a) => Number(a) === Availability.Voided);
      if (!anyVoided) {
        const { result } = await this.c.publicClient.simulateContract({
          account: this.c.account,
          address: d.eventComposer,
          abi: eventComposerAbi,
          functionName: "tryResolve",
          args: [compositeId],
        });
        if (!result[0]) continue;
      }
      await this.poke(`tryResolve ${compositeId}`, d.eventComposer, eventComposerAbi as Abi, "tryResolve", [compositeId]);
    }

    const count = await this.read<bigint>(d.market, marketAbi as Abi, "marketCount");
    if (count > 0n) {
      const ids = await this.read<Hex[]>(d.market, marketAbi as Abi, "getMarketIds", [0n, count]);
      for (const marketId of ids) {
        const m = await this.read<{ eventId: Hex; status: number }>(d.market, marketAbi as Abi, "getMarket", [marketId]);
        if (Number(m.status) !== MarketStatus.Open) continue;
        const a = Number(await this.read<number>(d.eventBus, eventBusAbi as Abi, "getAvailability", [m.eventId]));
        if (a !== Availability.Pending) {
          await this.poke(`settle market ${marketId}`, d.market, marketAbi as Abi, "settle", [marketId]);
        }
      }
    }

    await this.distributionTick();
    await this.vaultTick();
    // (Withdrawing this node's own dispute credits lives in RewardsDuty, which every node runs.)
  }

  /** Settle every open DistributionMarket whose boundary events are all decided. */
  private async distributionTick(): Promise<void> {
    const dist = this.c.deployment.distributionMarket;
    if (!dist) return;
    const count = await this.read<bigint>(dist, distributionMarketAbi as Abi, "marketCount");
    if (count === 0n) return;
    const ids = await this.read<Hex[]>(dist, distributionMarketAbi as Abi, "getMarketIds", [0n, count]);
    for (const marketId of ids) {
      const m = await this.read<{ status: number }>(dist, distributionMarketAbi as Abi, "getMarket", [marketId]);
      if (Number(m.status) !== 0) continue;
      const boundaries = await this.read<Hex[]>(dist, distributionMarketAbi as Abi, "getBoundaries", [marketId]);
      const avail = await Promise.all(
        boundaries.map((b) => this.read<number>(this.c.deployment.eventBus, eventBusAbi as Abi, "getAvailability", [b])),
      );
      if (avail.some((a) => Number(a) === Availability.Pending)) continue;
      await this.poke(`settle distribution market ${marketId}`, dist, distributionMarketAbi as Abi, "settle", [marketId]);
    }
  }

  /** Split decided events' pending fees into thirds; pull forfeited-bond ETH into the vault. */
  private async vaultTick(): Promise<void> {
    const vault = this.c.deployment.treasuryVault;
    if (!vault) return;
    for (const eventId of this.terminal) {
      const pending = await this.read<bigint>(vault, treasuryVaultAbi as Abi, "pendingFees", [eventId]);
      if (pending > 0n) await this.poke(`vault allocate ${eventId}`, vault, treasuryVaultAbi as Abi, "allocate", [eventId]);
    }
    const owedToVault = await this.read<bigint>(
      this.c.deployment.disputeManager,
      disputeManagerAbi as Abi,
      "pendingWithdrawals",
      [vault],
    );
    if (owedToVault > 0n) await this.poke(`vault sweep ${owedToVault} wei`, vault, treasuryVaultAbi as Abi, "sweepDisputeProceeds", []);
  }
}
