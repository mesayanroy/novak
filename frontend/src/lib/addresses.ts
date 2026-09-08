import type { NovakAddresses } from "@novak/sdk";

/** Filled in by the deploy script output / .env — see root .env.example. */
export const novakAddresses: NovakAddresses = {
  eventRegistry: (process.env.NEXT_PUBLIC_EVENT_REGISTRY_ADDRESS ?? "0x") as `0x${string}`,
  eventBus: (process.env.NEXT_PUBLIC_EVENT_BUS_ADDRESS ?? "0x") as `0x${string}`,
  eventComposer: (process.env.NEXT_PUBLIC_EVENT_COMPOSER_ADDRESS ?? "0x") as `0x${string}`,
  market: (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "0x") as `0x${string}`,
};
