import { parseAbiItem, toEventSelector, type Account, type PublicClient, type WalletClient } from "viem";
import {
  distributionMarketAbi,
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  marketAbi,
  treasuryVaultAbi,
  mockUsdgAbi,
  novakCtfAdapterAbi,
  settlementAbi,
  stockLendingGuardAbi,
  subscriptionManagerAbi,
} from "./abis.js";
import type {
  Address,
  Availability,
  DistributionMarketInfo,
  DistributionStatus,
  CompositeSpecInput,
  EventSpecInput,
  Hex,
  MarketDef,
  MarketStatus,
  NovakAddresses,
  Outcome,
} from "./types.js";
import { matchesEvent, rankMatches, selectPriceLadder, type EventMatch, type KnownEvent, type LadderQuery, type LadderRung } from "./reuse.js";

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

  /** `listEvents` plus each event's spec and status — the catalog the reuse helpers search. */
  async listKnownEvents(fromBlock: bigint): Promise<KnownEvent[]> {
    const created = await this.listEvents(fromBlock);
    const out: KnownEvent[] = [];
    for (let i = 0; i < created.length; i += 50) {
      const batch = created.slice(i, i + 50);
      const rows = await Promise.all(
        batch.map(async (e) => {
          const [spec, status] = await Promise.all([this.getEventSpec(e.eventId), this.getEventStatus(e.eventId)]);
          return { eventId: e.eventId, spec, status: Number(status), blockNumber: e.blockNumber };
        }),
      );
      out.push(...rows);
    }
    return out;
  }

  /**
   * Reuse before you create: events that already ask exactly this question
   * (same source + spec bytes), best first. Point your market at
   * `matches[0].eventId` instead of paying resolvers to answer it twice.
   */
  async findMatchingEvents(match: EventMatch, fromBlock: bigint): Promise<KnownEvent[]> {
    return rankMatches((await this.listKnownEvents(fromBlock)).filter((e) => matchesEvent(e, match)));
  }

  /** Existing "feed ≥ X at T" boundary events for one (feed, T), ascending by X. See `planLadder`. */
  async findPriceLadder(query: LadderQuery, fromBlock: bigint): Promise<LadderRung[]> {
    return selectPriceLadder(await this.listKnownEvents(fromBlock), query);
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

  // --- Batch events / threshold ladders ---

  /** Creates several events in one transaction (Registry.createEvents, max 16). */
  async createEvents(specs: EventSpecInput[], account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "createEvents",
      args: [specs],
    });
  }

  /** Event IDs created by a `createEvents` / `createEvent` transaction, in order. */
  async getCreatedEventIds(txHash: Hex): Promise<Hex[]> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const topic = toEventSelector(eventCreatedEvent);
    return receipt.logs
      .filter((l) => l.address.toLowerCase() === this.addresses.eventRegistry.toLowerCase() && l.topics[0] === topic)
      .map((l) => l.topics[1] as Hex);
  }

  // --- DistributionMarket (LMSR range markets) ---

  private get dist(): Address {
    if (!this.addresses.distributionMarket) throw new Error("NovakClient: distributionMarket address not set");
    return this.addresses.distributionMarket;
  }

  /** Approves any spender (e.g. the DistributionMarket) to pull collateral. */
  async approveCollateralFor(spender: Address, amount: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "approve",
      args: [spender, amount],
    });
  }

  async collateralAllowanceFor(owner: Address, spender: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.collateral,
      abi: mockUsdgAbi,
      functionName: "allowance",
      args: [owner, spender],
    });
  }

  /**
   * Opens a range market over `boundaryEventIds` (ascending thresholds,
   * boundary i = "value >= threshold_i"). The creator pays the LMSR subsidy
   * b·ln(N) — approve the DistributionMarket first (see `distributionSubsidy`).
   */
  async createDistributionMarket(
    question: string,
    boundaryEventIds: Hex[],
    tradingClosesAt: bigint,
    liquidity: bigint,
    account: Account | Address,
  ): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "createMarket",
      args: [question, boundaryEventIds, tradingClosesAt, liquidity],
    });
  }

  /** LMSR subsidy for N = boundaries + 1 buckets: ceil(b·ln N) + 1 unit (what createMarket pulls). */
  distributionSubsidy(liquidity: bigint, nBuckets: number): bigint {
    const wad = (Number(liquidity) * Math.log(nBuckets));
    return BigInt(Math.ceil(wad)) + 2n; // +1 margin, +1 for float rounding
  }

  async getCreatedDistributionMarketId(txHash: Hex): Promise<Hex> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === this.dist.toLowerCase());
    if (!log?.topics[1]) throw new Error("NovakClient: MarketCreated log not found");
    return log.topics[1] as Hex;
  }

  async distributionBuy(marketId: Hex, bucket: number, collateralIn: bigint, minShares: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "buy",
      args: [marketId, bucket, collateralIn, minShares],
    });
  }

  async distributionSell(marketId: Hex, bucket: number, shares: bigint, minCollateralOut: bigint, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "sell",
      args: [marketId, bucket, shares, minCollateralOut],
    });
  }

  async distributionSettle(marketId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "settle",
      args: [marketId],
    });
  }

  async distributionRedeem(marketId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "redeem",
      args: [marketId],
    });
  }

  async distributionQuoteBuy(marketId: Hex, bucket: number, collateralIn: bigint): Promise<{ shares: bigint; fee: bigint }> {
    const [shares, fee] = await this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "quoteBuy",
      args: [marketId, bucket, collateralIn],
    });
    return { shares, fee };
  }

  async distributionQuoteSell(marketId: Hex, bucket: number, shares: bigint): Promise<{ collateralOut: bigint; fee: bigint }> {
    const [collateralOut, fee] = await this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "quoteSell",
      args: [marketId, bucket, shares],
    });
    return { collateralOut, fee };
  }

  /** Bucket prices as probabilities (0..1), summing to ~1. */
  async distributionPrices(marketId: Hex): Promise<number[]> {
    const p = await this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "prices",
      args: [marketId],
    });
    return (p as readonly bigint[]).map((x) => Number(x) / 1e18);
  }

  async getDistributionMarket(marketId: Hex): Promise<
    DistributionMarketInfo & { marketId: Hex; boundaries: Hex[]; outstanding: bigint[]; prices: number[] }
  > {
    const [m, boundaries, outstanding, prices] = await Promise.all([
      this.publicClient.readContract({ address: this.dist, abi: distributionMarketAbi, functionName: "getMarket", args: [marketId] }),
      this.publicClient.readContract({ address: this.dist, abi: distributionMarketAbi, functionName: "getBoundaries", args: [marketId] }),
      this.publicClient.readContract({ address: this.dist, abi: distributionMarketAbi, functionName: "getOutstanding", args: [marketId] }),
      this.distributionPrices(marketId),
    ]);
    return {
      marketId,
      creator: m.creator,
      createdAt: m.createdAt,
      tradingClosesAt: m.tradingClosesAt,
      status: m.status as DistributionStatus,
      nBuckets: m.nBuckets,
      winningBucket: m.winningBucket,
      b: m.b,
      reserve: m.reserve,
      fees: m.fees,
      liability: m.liability,
      question: m.question,
      boundaries: [...(boundaries as readonly Hex[])],
      outstanding: [...(outstanding as readonly bigint[])],
      prices,
    };
  }

  async listDistributionMarkets(): Promise<Awaited<ReturnType<NovakClient["getDistributionMarket"]>>[]> {
    const count = await this.publicClient.readContract({ address: this.dist, abi: distributionMarketAbi, functionName: "marketCount" });
    if (count === 0n) return [];
    const ids = await this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "getMarketIds",
      args: [0n, count],
    });
    return Promise.all((ids as readonly Hex[]).map((id) => this.getDistributionMarket(id)));
  }

  async distributionSharesOf(marketId: Hex, trader: Address): Promise<bigint[]> {
    const s = await this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "sharesOf",
      args: [marketId, trader],
    });
    return [...(s as readonly bigint[])];
  }

  async distributionPayoutOf(marketId: Hex, trader: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.dist,
      abi: distributionMarketAbi,
      functionName: "payoutOf",
      args: [marketId, trader],
    });
  }

  // --- TreasuryVault ---

  private get vault(): Address {
    if (!this.addresses.treasuryVault) throw new Error("NovakClient: treasuryVault address not set");
    return this.addresses.treasuryVault;
  }

  async vaultClaimable(eventId: Hex, who: Address): Promise<{ resolver: bigint; committee: bigint }> {
    const [resolver, committee] = await Promise.all([
      this.publicClient.readContract({ address: this.vault, abi: treasuryVaultAbi, functionName: "claimableResolverReward", args: [eventId, who] }),
      this.publicClient.readContract({ address: this.vault, abi: treasuryVaultAbi, functionName: "claimableCommitteeReward", args: [eventId, who] }),
    ]);
    return { resolver, committee };
  }

  async vaultBalances(): Promise<{ treasury: bigint; insurance: bigint }> {
    const [treasury, insurance] = await Promise.all([
      this.publicClient.readContract({ address: this.vault, abi: treasuryVaultAbi, functionName: "treasuryBalance" }),
      this.publicClient.readContract({ address: this.vault, abi: treasuryVaultAbi, functionName: "insuranceReserve" }),
    ]);
    return { treasury, insurance };
  }

  async vaultPendingFees(eventId: Hex): Promise<bigint> {
    return this.publicClient.readContract({ address: this.vault, abi: treasuryVaultAbi, functionName: "pendingFees", args: [eventId] });
  }

  // --- Integration helper ---

  /**
   * Polls the Event Bus until `eventId` is decided (pull model — no push
   * delivery). Resolves with the outcome, or `{ voided: true }` if the event
   * will never resolve (refund your users). Rejects on timeout.
   */
  async waitForOutcome(
    eventId: Hex,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<{ voided: false; outcome: boolean; outcomeData: Hex } | { voided: true }> {
    const interval = opts.intervalMs ?? 15_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 7 * 24 * 3600 * 1000);
    for (;;) {
      const a = await this.getAvailability(eventId);
      if (a === 2) return { voided: true };
      if (a === 1) {
        const o = await this.readOutcome(eventId);
        const { outcome } = await this.resolveOutcome(eventId);
        return { voided: false, outcome, outcomeData: o.outcomeData };
      }
      if (Date.now() > deadline) throw new Error(`NovakClient: timed out waiting for ${eventId}`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  // --- Conditional Tokens (Polymarket-style) adapter ---
  // `adapter` is a NovakCTFAdapter you (or the venue) deployed next to its CTF.

  async ctfPrepareBinary(adapter: Address, eventId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: adapter,
      abi: novakCtfAdapterAbi,
      functionName: "prepareBinary",
      args: [eventId],
    });
  }

  async ctfPrepareRange(adapter: Address, boundaryEventIds: Hex[], account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: adapter,
      abi: novakCtfAdapterAbi,
      functionName: "prepareRange",
      args: [boundaryEventIds],
    });
  }

  /** Permissionless: reports Novak's answer into the CTF once every event is decided (void ⇒ equal payouts). */
  async ctfResolve(adapter: Address, questionId: Hex, account: Account | Address): Promise<Hex> {
    return this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: adapter,
      abi: novakCtfAdapterAbi,
      functionName: "resolve",
      args: [questionId],
    });
  }

  async ctfCanResolve(adapter: Address, questionId: Hex): Promise<boolean> {
    return this.publicClient.readContract({ address: adapter, abi: novakCtfAdapterAbi, functionName: "canResolve", args: [questionId] });
  }

  async ctfQuestionId(adapter: Address, eventIdOrBoundaries: Hex | Hex[]): Promise<Hex> {
    return Array.isArray(eventIdOrBoundaries)
      ? this.publicClient.readContract({ address: adapter, abi: novakCtfAdapterAbi, functionName: "rangeQuestionId", args: [eventIdOrBoundaries] })
      : this.publicClient.readContract({ address: adapter, abi: novakCtfAdapterAbi, functionName: "binaryQuestionId", args: [eventIdOrBoundaries] });
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) {
      throw new Error("NovakClient: a WalletClient is required for write operations");
    }
    return this.walletClient;
  }
}
