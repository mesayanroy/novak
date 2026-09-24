import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { NovakClient, decodeBoolOutcome, getDeployment, robinhoodTestnet } from "../src/index.js";

/** Example: read-only query of a finalized event's outcome through the Bus,
 *  for either a primitive or a composite event ID. */
async function main() {
  const chain = process.env.NOVAK_CHAIN_ID === "46630" ? robinhoodTestnet : foundry;
  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const addresses = getDeployment(chain.id);

  const client = new NovakClient(publicClient, undefined, addresses);

  const eventId = process.argv[2] as `0x${string}` | undefined;
  if (!eventId) {
    throw new Error("Usage: pnpm tsx sdk/examples/query-outcome.ts <eventId>");
  }

  const available = await client.isAvailable(eventId);
  console.log(`Event ${eventId} available:`, available);

  if (available) {
    const outcome = await client.readOutcome(eventId);
    console.log("Outcome:", { ...outcome, decoded: decodeBoolOutcome(outcome.outcomeData) });
  }
}


main().catch(console.error);
