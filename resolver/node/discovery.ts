import { parseAbiItem, type Hex, type PublicClient } from "viem";
import type { NovakDeployment } from "@novak/sdk";

const eventCreated = parseAbiItem(
  "event EventCreated(bytes32 indexed eventId, bytes32 indexed sourceId, uint16 specVersion)",
);
const compositeCreated = parseAbiItem(
  "event CompositeEventCreated(bytes32 indexed compositeId, uint8 op, bytes32[] operands)",
);

export interface PrimitiveMeta {
  sourceId: Hex;
  specVersion: number;
}

/**
 * On-chain event discovery (replaces the old RESOLVER_WATCHED_EVENT_IDS
 * list): incrementally scans the Registry's `EventCreated` and the
 * Composer's `CompositeEventCreated` logs from the deployment's `startBlock`.
 * Chunked, halving the chunk on RPC range/limit errors.
 */
export class EventIndex {
  readonly primitives = new Map<Hex, PrimitiveMeta>();
  readonly composites = new Map<Hex, { operands: Hex[] }>();
  private nextBlock: bigint;

  constructor(
    private readonly client: PublicClient,
    private readonly deployment: NovakDeployment,
    private chunk: bigint,
  ) {
    this.nextBlock = BigInt(deployment.startBlock);
  }

  get scannedTo(): bigint {
    return this.nextBlock - 1n;
  }

  async sync(): Promise<void> {
    const latest = await this.client.getBlockNumber();
    while (this.nextBlock <= latest) {
      const to = this.nextBlock + this.chunk - 1n > latest ? latest : this.nextBlock + this.chunk - 1n;
      try {
        const [prims, comps] = await Promise.all([
          this.client.getLogs({
            address: this.deployment.eventRegistry,
            event: eventCreated,
            fromBlock: this.nextBlock,
            toBlock: to,
          }),
          this.client.getLogs({
            address: this.deployment.eventComposer,
            event: compositeCreated,
            fromBlock: this.nextBlock,
            toBlock: to,
          }),
        ]);
        for (const l of prims) {
          this.primitives.set(l.args.eventId as Hex, {
            sourceId: (l.args.sourceId as Hex).toLowerCase() as Hex,
            specVersion: Number(l.args.specVersion),
          });
        }
        for (const l of comps) {
          this.composites.set(l.args.compositeId as Hex, { operands: [...(l.args.operands as Hex[])] });
        }
        this.nextBlock = to + 1n;
      } catch (err) {
        if (this.chunk <= 1_000n) throw err;
        this.chunk /= 2n;
      }
    }
  }
}
