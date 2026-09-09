import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";
import { NovakClient, decodeBoolOutcome, type NovakAddresses } from "../src/index.js";

/** Example: read-only query of a finalized event's outcome through the Bus,
 *  for either a primitive or a composite event ID. */
async function main() {
  const rpcUrl = process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545";
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });

  const addresses: NovakAddresses = {
    eventRegistry: requireEnv("EVENT_REGISTRY_ADDRESS"),
    eventBus: requireEnv("EVENT_BUS_ADDRESS"),
    eventComposer: requireEnv("EVENT_COMPOSER_ADDRESS"),
    subscriptionManager: requireEnv("SUBSCRIPTION_MANAGER_ADDRESS"),
    settlement: requireEnv("SETTLEMENT_ADDRESS"),
    positionManager: requireEnv("POSITION_MANAGER_ADDRESS"),
    market: requireEnv("MARKET_ADDRESS"),
  };

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

function requireEnv(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} — deploy contracts first (see script/Deploy.s.sol)`);
  return value as `0x${string}`;
}

main().catch(console.error);
