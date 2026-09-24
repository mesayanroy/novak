import { AbiDecodingDataSizeTooSmallError, AbiDecodingZeroDataError, type Abi, type Hex } from "viem";
import { EventStatus, encodeOutcomeForVersion, eventRegistryAbi, type EventSpecInput } from "@novak/sdk";
import type { SourceAdapter } from "../adapters/types.js";
import { buildEvidence, type EvidenceStore } from "../evidence/evidence.js";
import type { Clients } from "../lib/chain.js";
import { send } from "../lib/tx.js";
import type { EventIndex } from "./discovery.js";
import type { Log } from "./log.js";

/** Revert reasons meaning "this resolver is done with this event". */
const TERMINAL_REASONS = ["already submitted", "not accepting observations", "observation deadline passed"];

/**
 * The resolver duty: for every discovered event whose `sourceId` this node
 * has an adapter for, once the event's window is open, observe the source
 * and submit `(outcome[, occurredAt])` + an evidence hash. Quorum, proposal
 * and dispute-window bookkeeping all happen on-chain in the Registry.
 */
export class ResolverDuty {
  private readonly done = new Set<Hex>();
  private readonly specs = new Map<Hex, EventSpecInput>();
  submissions = 0;

  constructor(
    private readonly c: Clients,
    private readonly index: EventIndex,
    private readonly adapters: Map<Hex, SourceAdapter>,
    private readonly evidence: EvidenceStore,
    private readonly log: Log,
  ) {}

  async spec(eventId: Hex): Promise<EventSpecInput> {
    let s = this.specs.get(eventId);
    if (!s) {
      s = (await this.c.publicClient.readContract({
        address: this.c.deployment.eventRegistry,
        abi: eventRegistryAbi,
        functionName: "getEventSpec",
        args: [eventId],
      })) as EventSpecInput;
      this.specs.set(eventId, s);
    }
    return s;
  }

  async tick(now: bigint): Promise<void> {
    for (const [eventId, meta] of this.index.primitives) {
      if (this.done.has(eventId)) continue;
      const adapter = this.adapters.get(meta.sourceId);
      if (!adapter) continue;

      const status = Number(
        await this.c.publicClient.readContract({
          address: this.c.deployment.eventRegistry,
          abi: eventRegistryAbi,
          functionName: "getEvent",
          args: [eventId],
        }),
      );
      if (status !== EventStatus.Open && status !== EventStatus.ObservationsSubmitted) {
        if (status !== EventStatus.None) this.done.add(eventId);
        continue;
      }

      const spec = await this.spec(eventId);
      if (now < spec.openTimestamp) continue;
      if (now > spec.observationDeadline) {
        this.done.add(eventId);
        continue;
      }

      let obs;
      try {
        obs = await adapter.observe({ eventId, spec, now });
      } catch (err) {
        const msg = (err as Error).message;
        if (err instanceof AbiDecodingZeroDataError || err instanceof AbiDecodingDataSizeTooSmallError) {
          // The event's `spec` bytes don't match this sourceId's schema — it
          // can never be observed; stop retrying (it will expire).
          this.done.add(eventId);
          this.log.warn(`unobservable ${adapter.name} ${eventId}: malformed spec, skipping`);
        } else {
          this.log.warn(`observe failed ${adapter.name} ${eventId}: ${msg.split("\n")[0]}`);
        }
        continue;
      }
      if (!obs) continue; // abstain for now — too early / stale / source down

      const evidenceHash = this.evidence.put(buildEvidence(eventId, adapter.name, obs));
      const payload = encodeOutcomeForVersion(spec.specVersion, obs.outcome, obs.occurredAt);
      const res = await send(this.c, {
        address: this.c.deployment.eventRegistry,
        abi: eventRegistryAbi as Abi,
        functionName: "submitObservation",
        args: [eventId, payload, evidenceHash],
      });

      if (res.ok) {
        this.submissions++;
        this.done.add(eventId);
        this.log.info(
          `observed ${adapter.name} ${eventId} outcome=${obs.outcome} occurredAt=${obs.occurredAt} evidence=${evidenceHash} tx=${res.hash}`,
        );
      } else if (TERMINAL_REASONS.some((r) => res.reason.includes(r))) {
        this.done.add(eventId);
      } else {
        this.log.warn(`submit failed ${eventId}: ${res.reason}`);
      }
    }
  }
}
