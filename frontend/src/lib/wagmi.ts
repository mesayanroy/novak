import { http, createConfig } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * MVP wagmi config: local anvil chain for development + Sepolia for a public
 * demo deployment. Add walletConnect() here once NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
 * is set — omitted for now to keep the scaffold dependency-light.
 */
export const wagmiConfig = createConfig({
  chains: [foundry, sepolia],
  connectors: [injected()],
  transports: {
    [foundry.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"),
    [sepolia.id]: http(),
  },
});
