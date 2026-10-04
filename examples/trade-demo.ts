/**
 * Simulates traders on every open DistributionMarket so a demo shows a moving
 * distribution: each trader mints test USDG, approves, and buys a range
 * (trader i favours bucket i mod N), printing the distribution after trades.
 *
 *   NOVAK_CHAIN_ID=31337 pnpm tsx examples/trade-demo.ts
 *   NOVAK_CHAIN_ID=46630 TRADER_KEYS=0x..,0x.. pnpm tsx examples/trade-demo.ts
 *
 * Default TRADER_KEYS are anvil's public test keys #4 and #5 (local only).
 */
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DistributionStatus, NovakClient, foundry, getDeployment, robinhoodTestnet, type Hex } from "../sdk/src/index.js";

const chainId = Number(process.env.NOVAK_CHAIN_ID ?? 31337);
const chain = chainId === foundry.id ? foundry : robinhoodTestnet;
const rpcUrl =
  chainId === foundry.id
    ? (process.env.RPC_URL_LOCAL ?? "http://127.0.0.1:8545")
    : (process.env.RPC_URL_ROBINHOOD_TESTNET ?? "https://rpc.testnet.chain.robinhood.com");
const keys = (
  process.env.TRADER_KEYS ??
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a,0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
)
  .split(",")
  .map((k) => k.trim() as Hex);

async function main() {
  const d = getDeployment(chainId);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  const reader = new NovakClient(publicClient, undefined, d);
  // Only markets still inside their trading window (chain time, with a margin).
  const now = (await publicClient.getBlock()).timestamp;
  const markets = (await reader.listDistributionMarkets()).filter(
    (m) => m.status === DistributionStatus.Open && m.tradingClosesAt > now + 30n,
  );
  if (markets.length === 0) return console.log("no tradable distribution markets — run examples/seed-demo.ts first");

  for (const [i, key] of keys.entries()) {
    const account = privateKeyToAccount(key);
    const client = new NovakClient(publicClient, createWalletClient({ account, chain, transport: http(rpcUrl) }), d);
    const wait = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
    if (d.collateralIsMock) await wait(await client.mintTestCollateral(account.address, 5_000_000_000n, account));
    await wait(await client.approveCollateralFor(d.distributionMarket, 2n ** 255n, account));
    for (const m of markets) {
      const bucket = (i * 2 + 1) % m.nBuckets;
      const amount = BigInt(50 + i * 25) * 1_000_000n;
      const { shares } = await client.distributionQuoteBuy(m.marketId, bucket, amount);
      await wait(await client.distributionBuy(m.marketId, bucket, amount, (shares * 99n) / 100n, account));
      console.log(`${account.address.slice(0, 8)} bought ${Number(shares) / 1e6} shares of bucket ${bucket} for ${Number(amount) / 1e6} USDG`);
    }
  }

  for (const m of markets) {
    const p = await reader.distributionPrices(m.marketId);
    console.log(`\n${m.question}\n  distribution: ${p.map((x) => (x * 100).toFixed(1) + "%").join("  ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
