import {
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { eventBusAbi, eventComposerAbi, eventRegistryAbi, marketAbi } from "./abis.js";
import type {
  CompositeSpecInput,
  EventSpecInput,
  Hex,
  NovakAddresses,
  Outcome,
} from "./types.js";

/**
 * Thin wrapper over the Novak contract surface. Deliberately mirrors the
 * on-chain layering: methods that read finalized data go through EventBus only;
 * methods for creating primitive/composite events and markets are exposed
 * separately since they're write paths on their respective contracts.
 *
 * This SDK never exposes a resolver-facing method — resolvers submit
 * observations directly against EventRegistry from the resolver node, not
 * through this consumer-facing SDK.
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
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    // TODO: decode the returned eventId from receipt logs (EventCreated) once
    // ABI event decoding is wired up here — createEvent's return value isn't
    // directly recoverable from a transaction receipt without log parsing.
    return receipt.transactionHash;
  }

  async isFinalized(eventId: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "isFinalized",
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
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return receipt.transactionHash;
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

  // --- Derivatives market ---

  async createMarket(eventId: Hex, account: Account): Promise<Hex> {
    const hash = await this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "createMarket",
      args: [eventId],
    });
    return hash;
  }

  async settleMarket(marketId: Hex, account: Account): Promise<Hex> {
    const hash = await this.requireWallet().writeContract({
      account,
      chain: this.walletClient?.chain,
      address: this.addresses.market,
      abi: marketAbi,
      functionName: "settle",
      args: [marketId],
    });
    return hash;
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) {
      throw new Error("NovakClient: a WalletClient is required for write operations");
    }
    return this.walletClient;
  }
}
