#!/usr/bin/env node
// Turns Foundry's broadcast receipts for script/Deploy.s.sol into
// deployments/<chainId>.json — the single address source the SDK, resolver,
// keeper and frontend read, instead of copying ~10 env vars by hand.
//
// It also records `startBlock`: the L2 block of the first deployment tx, from
// the RPC receipt. (Inside contracts on Arbitrum/Orbit chains like Robinhood
// Chain, `block.number` is an L1 estimate, so the deploy script itself can't
// record a usable block for log scanning.)
//
// Usage: node script/export-deployment.mjs <chainId>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = process.argv[2];
if (!chainId) {
  console.error("usage: node script/export-deployment.mjs <chainId>");
  process.exit(1);
}

const runPath = join(root, "broadcast", "Deploy.s.sol", chainId, "run-latest.json");
const run = JSON.parse(readFileSync(runPath, "utf8"));

// Contract name in the broadcast -> key in deployments/<chainId>.json
const keys = {
  MockUSDG: "collateral",
  EventRegistry: "eventRegistry",
  DisputeManager: "disputeManager",
  EventComposer: "eventComposer",
  EventBus: "eventBus",
  SubscriptionManager: "subscriptionManager",
  Settlement: "settlement",
  PositionManager: "positionManager",
  Market: "market",
  DistributionMarket: "distributionMarket",
  TreasuryVault: "treasuryVault",
  StockLendingGuard: "stockLendingGuard",
};

const addresses = {};
for (const tx of run.transactions) {
  if (tx.transactionType === "CREATE" && keys[tx.contractName]) {
    addresses[keys[tx.contractName]] = tx.contractAddress;
  }
}
if (!addresses.collateral) {
  addresses.collateral = process.env.COLLATERAL_TOKEN_ADDRESS;
}

const missing = Object.values(keys).filter((k) => !addresses[k]);
if (missing.length) {
  console.error(`missing addresses in broadcast: ${missing.join(", ")}`);
  process.exit(1);
}

const blocks = run.receipts.map((r) => Number(BigInt(r.blockNumber)));
const out = {
  chainId: Number(chainId),
  startBlock: Math.min(...blocks),
  // Foundry records this in ms in recent versions, seconds in older ones.
  deployedAt: new Date(run.timestamp > 1e12 ? run.timestamp : run.timestamp * 1000).toISOString(),
  collateralIsMock: Boolean(run.transactions.find((t) => t.contractName === "MockUSDG")),
  ...addresses,
};

const outPath = join(root, "deployments", `${chainId}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${outPath}`);
console.log(out);
