import { createPublicClient, http } from "viem";
import { anvil } from "viem/chains";
import { NovakClient, type NovakAddresses } from "../src/index.js";

/** Example: read-only query of a finalized event's outcome through the Bus. */
async function main() {
  const publicClient = createPublicClient({ chain: anvil, transport: http("http://127.0.0.1:8545") });

  const addresses: NovakAddresses = {
    eventRegistry: (process.env.EVENT_REGISTRY_ADDRESS ?? "0x") as `0x${string}`,
    eventBus: (process.env.EVENT_BUS_ADDRESS ?? "0x") as `0x${string}`,
    eventComposer: (process.env.EVENT_COMPOSER_ADDRESS ?? "0x") as `0x${string}`,
    market: (process.env.MARKET_ADDRESS ?? "0x") as `0x${string}`,
  };

  const client = new NovakClient(publicClient, undefined, addresses);

  const eventId = (process.argv[2] ?? "0x") as `0x${string}`;
  const available = await client.isAvailable(eventId);
  console.log(`Event ${eventId} available:`, available);

  if (available) {
    const outcome = await client.readOutcome(eventId);
    console.log("Outcome:", outcome);
  }
}

main().catch(console.error);
