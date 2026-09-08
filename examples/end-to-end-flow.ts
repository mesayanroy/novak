/**
 * Canonical Novak flow, illustrated end-to-end:
 *
 *   1. Create two primitive events (Registry).
 *   2. Resolvers submit observations for each (resolver network — see
 *      resolver/README.md). [NOT YET IMPLEMENTED on-chain — see TODOs in
 *      contracts/EventRegistry.sol]
 *   3. Quorum is reached and each event is finalized (Registry).
 *   4. Compose AND/WITHIN(48h) over the two primitives (Composer) to get a
 *      composite event ID.
 *   5. A derivatives Market is created against the composite event ID
 *      (Market reads only through the Bus).
 *   6. Once the composite resolves, the Market is settled.
 *
 * This script demonstrates steps 1, 4, and 5 today, since steps 2/3/6 require
 * resolver <-> Registry wiring that is intentionally left as a TODO (see
 * contracts/EventRegistry.sol and resolver/README.md "Status"). Run this after
 * `forge script script/Deploy.s.sol --rpc-url local --broadcast` against a
 * local anvil node, with the printed addresses set in your .env.
 *
 * Usage: pnpm tsx examples/end-to-end-flow.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { NovakClient, CompositeOp, type NovakAddresses } from "../sdk/src/index.js";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY (see .env.example) before running this example.");
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: foundry, transport: http(rpcUrl) });

  const addresses: NovakAddresses = {
    eventRegistry: requireEnv("EVENT_REGISTRY_ADDRESS"),
    eventBus: requireEnv("EVENT_BUS_ADDRESS"),
    eventComposer: requireEnv("EVENT_COMPOSER_ADDRESS"),
    market: requireEnv("MARKET_ADDRESS"),
  };

  const client = new NovakClient(publicClient, walletClient, addresses);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Step 1: creating two primitive events…");
  await client.createEvent(
    {
      specVersion: 1,
      sourceId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      spec: "0x",
    },
    account,
  );
  await client.createEvent(
    {
      specVersion: 1,
      sourceId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      spec: "0x",
    },
    account,
  );

  console.log("Steps 2-3 (resolver observations -> quorum -> finalize): TODO, not yet on-chain.");
  console.log("Step 4 (compose AND/WITHIN(48h)) and step 5 (create market): see sdk/examples/create-and-compose.ts");
  console.log(`(CompositeOp.Within = ${CompositeOp.Within}, for reference)`);
  console.log("Step 6 (settle): blocked on steps 2-3.");
}

function requireEnv(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} — deploy contracts first (see script/Deploy.s.sol)`);
  return value as `0x${string}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
