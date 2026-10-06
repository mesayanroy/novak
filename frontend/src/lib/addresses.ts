import { deployments, type NovakAddresses, type NovakDeployment } from "@novakoracle/sdk";

/**
 * Which chain the app talks to: Robinhood Chain testnet (46630) by default,
 * or local anvil (31337) for development. Contract addresses come from the
 * SDK's generated `deployments` (deployments/<chainId>.json, written by
 * script/export-deployment.mjs) — no per-contract env vars.
 */
export const NOVAK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 46630);

/** The deployment for the configured chain ONLY — never another chain's
 *  addresses (an anvil address has no code on Robinhood testnet). */
export const deployment: NovakDeployment | undefined = deployments[NOVAK_CHAIN_ID];

const NONE = "0x" as `0x${string}`;

export const novakAddresses: NovakAddresses & { stockLendingGuard: `0x${string}` } = deployment ?? {
  eventRegistry: NONE,
  disputeManager: NONE,
  eventBus: NONE,
  eventComposer: NONE,
  subscriptionManager: NONE,
  settlement: NONE,
  positionManager: NONE,
  market: NONE,
  collateral: NONE,
  stockLendingGuard: NONE,
};

/** True once a real deployment exists for the configured chain. */
export function hasLiveMarketAddresses(): boolean {
  return deployment !== undefined;
}
