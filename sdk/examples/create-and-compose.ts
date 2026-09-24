import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { NovakClient, CompositeOp, getDeployment, robinhoodTestnet } from "../src/index.js";

/**
 * Example: create two primitive events and compose them with WITHIN(48h).
 * Run against a local anvil node with the contracts deployed (see
 * script/Deploy.s.sol) and addresses set in .env.
 *
 * Composite creation only requires operands to EXIST (be registered events),
 * not to be finalized yet — see IEventComposer.createComposite. Resolving the
 * composite (composer.tryResolve) requires both operands to actually finalize
 * first, which needs authorized resolvers to submit observations and reach
 * quorum — see resolver/README.md and examples/end-to-end-flow.ts for that
 * full path.
 */
async function main() {
  const chain = process.env.NOVAK_CHAIN_ID === "46630" ? robinhoodTestnet : foundry;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY (see .env.example) before running this example.");
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const addresses = getDeployment(chain.id);

  const client = new NovakClient(publicClient, walletClient, addresses);
  const now = BigInt(Math.floor(Date.now() / 1000));

  const txA = await client.createEvent(
    {
      specVersion: 1,
      sourceId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      quorumThreshold: 2,
      spec: "0x",
    },
    account,
  );
  const eventA = await client.getCreatedEventId(txA);
  console.log(`Created event A: ${eventA}`);

  const txB = await client.createEvent(
    {
      specVersion: 1,
      sourceId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      openTimestamp: now,
      observationDeadline: now + 86_400n,
      disputeWindowSeconds: 3_600n,
      quorumThreshold: 2,
      spec: "0x",
    },
    account,
  );
  const eventB = await client.getCreatedEventId(txB);
  console.log(`Created event B: ${eventB}`);

  const compositeTx = await client.createComposite(
    { op: CompositeOp.Within, operands: [eventA, eventB], window: 48n * 3600n },
    account,
  );
  console.log(`Created composite (WITHIN 48h) in tx ${compositeTx}`);
  console.log("Composite created but not yet resolvable — its operands must finalize first.");
  console.log("See resolver/README.md and examples/end-to-end-flow.ts for the resolution path.");
}


main().catch(console.error);
