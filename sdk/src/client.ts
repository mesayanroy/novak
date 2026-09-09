import type { Account, PublicClient, WalletClient } from "viem";
import {
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  marketAbi,
  settlementAbi,
  subscriptionManagerAbi,
} from "./abis.js";
import type {
  CompositeSpecInput,
  EventSpecInput,
  Hex,
  MarketDef,
  NovakAddresses,
  Outcome,
} from "./types.js";

/**
 * Thin wrapper over the Novak contract surface. Deliberately mirrors the
 * on-chain layering: reads of finalized event data go through EventBus only;
 * event/composite creation are separate write paths on their respective
 * contracts; market interaction goes through Market (which itself only
 * depends on Settlement -> EventBus).
 *
 * This SDK is CONSUMER-facing: it does not expose resolver submission
 * methods (`submitObservation`, `dispute`, `resolveDispute`,
 * `setResolverAuthorization`) — those belong to the resolver network's own
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

  async createEvent(spec: EventSpecInput, account: Account): Promise<Hex> {
    const hash = await this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "createEvent",
      args: [spec],
    });
    return hash;
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
  async finalize(eventId: Hex, account: Account): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "finalize",
      args: [eventId],
    });
  }

  // --- Composition ---

  async createComposite(spec: CompositeSpecInput, account: Account): Promise<Hex> {
    const hash = await this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "createComposite",
      args: [spec],
    });
    return hash;
  }

  /** Attempts to resolve a composite event once its operands are finalized. */
  async tryResolveComposite(compositeId: Hex, account: Account): Promise<Hex> {
    const hash = await this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "tryResolve",
      args: [compositeId],
    });
    return hash;
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

  async subscribe(topic: Hex, consumer: Hex, account: Account): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.subscriptionManager,
      abi: subscriptionManagerAbi,
      functionName: "subscribe",
      args: [topic, consumer],
    });
  }

  async unsubscribe(topic: Hex, consumer: Hex, account: Account): Promise<Hex> {
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

  // --- Derivatives market ---

  async createMarket(eventId: Hex, account: Account): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "createMarket",
      args: [eventId],
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

  async depositCollateral(
    marketId: Hex,
    backingYes: boolean,
    amountWei: bigint,
    account: Account,
  ): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "depositCollateral",
      args: [marketId, backingYes],
      value: amountWei,
    });
  }

  async closePosition(
    marketId: Hex,
    backingYes: boolean,
    amountWei: bigint,
    account: Account,
  ): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "closePosition",
      args: [marketId, backingYes, amountWei],
    });
  }

  async settleMarket(marketId: Hex, account: Account): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "settle",
      args: [marketId],
    });
  }

  async claim(marketId: Hex, account: Account): Promise<Hex> {
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
    const [eventId, createdAt, settled, outcome, yesPool, noPool] = await this.publicClient.readContract({
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "markets",
      args: [marketId],
    });
    return { eventId, createdAt, settled, outcome, yesPool, noPool };
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) {
      throw new Error("NovakClient: a WalletClient is required for write operations");
    }
    return this.walletClient;
  }
}
