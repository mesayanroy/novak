import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { NovakClient, CompositeOp, type NovakAddresses } from "../src/index.js";

/**
 * Example: create two primitive events and compose them with WITHIN(48h).
 * Run against a local anvil node with the contracts deployed
 * (see script/Deploy.s.sol).
 */
async function main() {
  const account = privateKeyToAccount(
    (process.env.RESOLVER_PRIVATE_KEY ?? "0x0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`,
  );

  const publicClient = createPublicClient({ chain: anvil, transport: http("http://127.0.0.1:8545") });
  const walletClient = createWalletClient({ account, chain: anvil, transport: http("http://127.0.0.1:8545") });

  const addresses: NovakAddresses = {
    eventRegistry: (process.env.EVENT_REGISTRY_ADDRESS ?? "0x") as `0x${string}`,
    eventBus: (process.env.EVENT_BUS_ADDRESS ?? "0x") as `0x${string}`,
    eventComposer: (process.env.EVENT_COMPOSER_ADDRESS ?? "0x") as `0x${string}`,
    market: (process.env.MARKET_ADDRESS ?? "0x") as `0x${string}`,
  };

  const client = new NovakClient(publicClient, walletClient, addresses);

  const now = BigInt(Math.floor(Date.now() / 1000));

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

  // TODO: decode eventId from the createEvent transaction receipt (see
  // NovakClient.createEvent TODO) before this composite creation call is
  // functional end-to-end. Left as an illustration of the intended flow.
  console.log("See docs/protocol-spec.md and examples/end-to-end-flow.ts for the full flow.");
  void CompositeOp.Within;
}

main().catch(console.error);
