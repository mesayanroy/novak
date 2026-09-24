import { foundry, robinhood, robinhoodTestnet } from "viem/chains";
import { deployments } from "./deployments.js";
import type { NovakDeployment } from "./types.js";

/**
 * Robinhood Chain (Arbitrum Orbit L2, ETH gas). Novak DEPLOYS to the testnet
 * (46630); mainnet (4663) is only READ by resolvers as a data source.
 */
export { foundry, robinhood, robinhoodTestnet };

export const ROBINHOOD_TESTNET_ID = robinhoodTestnet.id; // 46630
export const ROBINHOOD_MAINNET_ID = robinhood.id; // 4663

export const TESTNET_FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";

export function getDeployment(chainId: number): NovakDeployment {
  const d = deployments[chainId];
  if (!d) {
    throw new Error(
      `No Novak deployment for chain ${chainId}. Deploy (script/Deploy.s.sol), run ` +
        "`node script/export-deployment.mjs <chainId>`, then `pnpm --filter @novak/sdk gen`.",
    );
  }
  return d;
}

export function explorerUrl(chainId: number): string | undefined {
  if (chainId === robinhoodTestnet.id) return robinhoodTestnet.blockExplorers.default.url;
  if (chainId === robinhood.id) return robinhood.blockExplorers.default.url;
  return undefined;
}
