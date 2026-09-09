import type { NovakAddresses } from "@novak/sdk";

/** Filled in by the deploy script output / .env — see root .env.example. */
export const novakAddresses: NovakAddresses = {
  eventRegistry: (process.env.NEXT_PUBLIC_EVENT_REGISTRY_ADDRESS ?? "0x") as `0x${string}`,
  disputeManager: (process.env.NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS ?? "0x") as `0x${string}`,
  eventBus: (process.env.NEXT_PUBLIC_EVENT_BUS_ADDRESS ?? "0x") as `0x${string}`,
  eventComposer: (process.env.NEXT_PUBLIC_EVENT_COMPOSER_ADDRESS ?? "0x") as `0x${string}`,
  subscriptionManager: (process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS ?? "0x") as `0x${string}`,
  settlement: (process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS ?? "0x") as `0x${string}`,
  positionManager: (process.env.NEXT_PUBLIC_POSITION_MANAGER_ADDRESS ?? "0x") as `0x${string}`,
  market: (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "0x") as `0x${string}`,
};

/** True once every address needed for the live position-taking flow on
 *  /markets/[id] is actually configured (not the "0x" placeholder). */
export function hasLiveMarketAddresses(): boolean {
  return novakAddresses.market !== "0x" && novakAddresses.settlement !== "0x";
}
