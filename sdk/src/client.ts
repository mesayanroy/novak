import { parseAbiItem, type Account, type PublicClient, type WalletClient } from "viem";
import {
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  marketAbi,
  mockUsdgAbi,
  settlementAbi,
  stockLendingGuardAbi,
  subscriptionManagerAbi,
} from "./abis.js";
import type {
  Address,
  Availability,
  CompositeSpecInput,
  EventSpecInput,
  Hex,
  MarketDef,
  MarketStatus,
  NovakAddresses,
  Outcome,
} from "./types.js";

const eventCreatedEvent = parseAbiItem(
  "event EventCreated(bytes32 indexed eventId, bytes32 indexed sourceId, uint16 specVersion)",
);

/**
 * Thin wrapper over the Novak contract surface. Deliberately mirrors the
 * on-chain layering: reads of finalized event data go through EventBus only;
 * event/composite creation are separate write paths on their respective
 * contracts; market interaction goes through Market (which itself only
 * depends on Settlement -> EventBus).
 *
 * This SDK is CONSUMER-facing: it does not expose resolver/committee-member
 * write methods (`submitObservation`, `setResolverAuthorization`, or the
 * `IDisputeManager` tiered-escalation calls — `dispute`, `submitTier1Vote`,
 * `submitTier2Vote`, `escalateTier2`, `voidAfterTier2Timeout`,
 * `escalateNonConvergence`) — those belong to the resolver network's own
 * on-chain calls (see resolver/node/index.ts), which intentionally uses its
 * own thin viem calls against the same ABI rather than going through this
 * consumer SDK, keeping the resolver/consumer boundary visible in the code
 * structure, not just in comments.
 */
export class NovakClient {
  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient: WalletClient | undefined,
    private readonly addresses: NovakAddresses,
  ) {}

  // --- Event creation (Registry) ---

  async createEvent(spec: EventSpecInput, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "createEvent",
      args: [spec],
    });
  }

  /** Decodes the `eventId` a `createEvent` transaction produced from its logs. */
  async getCreatedEventId(txHash: Hex): Promise<Hex> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === this.addresses.eventRegistry.toLowerCase(),
    );
    if (!log || !log.topics[1]) {
      throw new Error("NovakClient: could not find EventCreated log for this transaction");
    }
    return log.topics[1] as Hex; // eventId is the first indexed topic on EventCreated
  }

  async getEventStatus(eventId: Hex): Promise<number> {
    return this.publicClient.readContract({
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "getEvent",
      args: [eventId],
    });
  }

  async getEventSpec(eventId: Hex): Promise<EventSpecInput> {
    return this.publicClient.readContract({
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "getEventSpec",
      args: [eventId],
    }) as Promise<EventSpecInput>;
  }

  async isFinalized(eventId: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "isFinalized",
      args: [eventId],
    });
  }

  /** Finalizes a proposed outcome once its dispute window has elapsed with no
   *  dispute filed. Permissionless — callable by anyone, including a
   *  consumer that wants to "pull the trigger" on availability. */
  async finalize(eventId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "finalize",
      args: [eventId],
    });
  }

  /** Every primitive event created since `fromBlock` (use the deployment's `startBlock`). */
  async listEvents(fromBlock: bigint): Promise<Array<{ eventId: Hex; sourceId: Hex; specVersion: number; blockNumber: bigint }>> {
    const logs = await this.publicClient.getLogs({
      address: this.addresses.eventRegistry,
      event: eventCreatedEvent,
      fromBlock,
      toBlock: "latest",
    });
    return logs.map((l) => ({
      eventId: l.args.eventId as Hex,
      sourceId: l.args.sourceId as Hex,
      specVersion: Number(l.args.specVersion),
      blockNumber: l.blockNumber,
    }));
  }

  // --- Composition ---

  async createComposite(spec: CompositeSpecInput, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "createComposite",
      args: [spec],
    });
  }

  /** Attempts to resolve a composite event once its operands are decided. */
  async tryResolveComposite(compositeId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "tryResolve",
      args: [compositeId],
    });
  }

  async getResolvedComposite(compositeId: Hex): Promise<{ resolved: boolean; outcome: boolean }> {
    const [resolved, outcome] = await this.publicClient.readContract({
      address: this.addresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "getResolvedOutcome",
      args: [compositeId],
    });
    return { resolved, outcome };
  }

  // --- Consumption (Bus only) ---

  async readOutcome(eventId: Hex): Promise<Outcome> {
    return this.publicClient.readContract({
      address: this.addresses.eventBus,
      abi: eventBusAbi,
      functionName: "readOutcome",
      args: [eventId],
    }) as Promise<Outcome>;
  }

  async isAvailable(eventId: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.eventBus,
      abi: eventBusAbi,
      functionName: "isAvailable",
      args: [eventId],
    });
  }

  /** Pending / Available / Voided — distinguishes "not yet" from "never". */
  async getAvailability(eventId: Hex): Promise<Availability> {
    return this.publicClient.readContract({
      address: this.addresses.eventBus,
      abi: eventBusAbi,
      functionName: "getAvailability",
      args: [eventId],
    }) as Promise<Availability>;
  }

  /** Convenience: reads an event's outcome as a plain boolean via Settlement,
   *  without the caller needing to decode `Outcome.outcomeData` itself. */
  async resolveOutcome(eventId: Hex): Promise<{ available: boolean; outcome: boolean }> {
    const [available, outcome] = await this.publicClient.readContract({
      address: this.addresses.settlement,
      abi: settlementAbi,
      functionName: "resolveOutcome",
      args: [eventId],
    });
    return { available, outcome };
  }

  // --- Subscription (MVP: pull-based; this only records intent — see
  // ISubscriptionManager for why there's no push delivery here) ---

  async subscribe(topic: Hex, consumer: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.subscriptionManager,
      abi: subscriptionManagerAbi,
      functionName: "subscribe",
      args: [topic, consumer],
    });
  }

  async unsubscribe(topic: Hex, consumer: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.subscriptionManager,
      abi: subscriptionManagerAbi,
      functionName: "unsubscribe",
      args: [topic, consumer],
    });
  }

  async isSubscribed(topic: Hex, consumer: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.subscriptionManager,
      abi: subscriptionManagerAbi,
      functionName: "isSubscribed",
      args: [topic, consumer],
    });
  }

  // --- Collateral (USDG / MockUSDG) ---

  async collateralBalance(owner: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "balanceOf",
      args: [owner],
    });
  }

  async collateralAllowance(owner: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "allowance",
      args: [owner, this.addresses.market],
    });
  }

  /** Approves the Market to pull `amount` collateral (6 decimals for USDG). */
  async approveCollateral(amount: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "approve",
      args: [this.addresses.market, amount],
    });
  }

  /** TESTNET ONLY: mints MockUSDG (capped per call by the contract). */
  async mintTestCollateral(to: Address, amount: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "mint",
      args: [to, amount],
    });
  }

  // --- Derivatives market ---

  /** `tradingClosesAt` should be the underlying event's `openTimestamp`. */
  async createMarket(eventId: Hex, tradingClosesAt: bigint, question: string, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "createMarket",
      args: [eventId, tradingClosesAt, question],
    });
  }

  /** Decodes the `marketId` a `createMarket` transaction produced from its logs. */
  async getCreatedMarketId(txHash: Hex): Promise<Hex> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === this.addresses.market.toLowerCase());
    if (!log || !log.topics[1]) {
      throw new Error("NovakClient: could not find MarketCreated log for this transaction");
    }
    return log.topics[1] as Hex; // marketId is the first indexed topic on MarketCreated
  }

  /** Requires a prior `approveCollateral` of at least `amount`. */
  async depositCollateral(marketId: Hex, backingYes: boolean, amount: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "depositCollateral",
      args: [marketId, backingYes, amount],
    });
  }

  /** Withdraws own stake — only while trading is open. */
  async closePosition(marketId: Hex, backingYes: boolean, amount: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "closePosition",
      args: [marketId, backingYes, amount],
    });
  }

  async settleMarket(marketId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "settle",
      args: [marketId],
    });
  }

  async claim(marketId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "claim",
      args: [marketId],
    });
  }

  async getMarket(marketId: Hex): Promise<MarketDef> {
    const m = await this.publicClient.readContract({
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "getMarket",
      args: [marketId],
    });
    return {
      eventId: m.eventId,
      creator: m.creator,
      createdAt: m.createdAt,
      tradingClosesAt: m.tradingClosesAt,
      status: m.status as MarketStatus,
      outcome: m.outcome,
      yesPool: m.yesPool,
      noPool: m.noPool,
      feeTaken: m.feeTaken,
      question: m.question,
    };
  }

  /** All market IDs, oldest first (paginated on-chain; no indexer needed). */
  async listMarketIds(pageSize = 100n): Promise<Hex[]> {
    const count = await this.publicClient.readContract({
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "marketCount",
    });
    const ids: Hex[] = [];
    for (let offset = 0n; offset < count; offset += pageSize) {
      const page = await this.publicClient.readContract({
        address: this.addresses.market,
        abi: marketAbi,
        functionName: "getMarketIds",
        args: [offset, pageSize],
      });
      ids.push(...(page as Hex[]));
    }
    return ids;
  }

  async listMarkets(): Promise<Array<MarketDef & { marketId: Hex }>> {
    const ids = await this.listMarketIds();
    return Promise.all(ids.map(async (marketId) => ({ marketId, ...(await this.getMarket(marketId)) })));
  }

  /** What `trader` would receive from `claim` right now. */
  async payoutOf(marketId: Hex, trader: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "payoutOf",
      args: [marketId, trader],
    });
  }

  // --- StockLendingGuard (second consumer) ---

  async canLiquidate(stockToken: Address): Promise<{ allowed: boolean; blockingEventId: Hex }> {
    if (!this.addresses.stockLendingGuard) throw new Error("NovakClient: stockLendingGuard address not set");
    const [allowed, blockingEventId] = await this.publicClient.readContract({
      address: this.addresses.stockLendingGuard,
      abi: stockLendingGuardAbi,
      functionName: "canLiquidate",
      args: [stockToken],
    });
    return { allowed, blockingEventId };
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) {
      throw new Error("NovakClient: a WalletClient is required for write operations");
    }
    return this.walletClient;
  }
}
