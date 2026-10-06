import { FileCode2 } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { C, Callout, DataTable, DocHeader, H2, H3, P, StatGrid } from "@/components/docs/DocPrimitives";

export const metadata = { title: "SDK reference — Novak Docs" };

type M = [name: string, kind: "read" | "write" | "helper", returns: string];

const GROUPS: { title: string; note?: string; methods: M[] }[] = [
  {
    title: "Events (EventRegistry)",
    methods: [
      ["createEvent(spec, account)", "write", "tx hash"],
      ["createEvents(specs[], account)", "write", "tx hash — up to 16 in one transaction"],
      ["getCreatedEventId(txHash) · getCreatedEventIds(txHash)", "read", "Hex · Hex[] (waits for the receipt)"],
      ["getEventStatus(eventId)", "read", "EventStatus number"],
      ["getEventSpec(eventId)", "read", "EventSpecInput"],
      ["isFinalized(eventId)", "read", "boolean"],
      ["finalize(eventId, account)", "write", "tx hash (after the dispute window)"],
      ["listEvents(fromBlock)", "read", "{ eventId, sourceId, specVersion, blockNumber }[]"],
    ],
  },
  {
    title: "Reading outcomes (EventBus / Settlement)",
    note: "The consumer path — use these to settle anything.",
    methods: [
      ["getAvailability(eventId)", "read", "Availability: 0 Pending · 1 Available · 2 Voided"],
      ["isAvailable(eventId)", "read", "boolean"],
      ["readOutcome(eventId)", "read", "Outcome { outcomeData, finalizedAt, … }"],
      ["resolveOutcome(eventId)", "read", "{ available, outcome } via Settlement"],
      ["waitForOutcome(eventId, { intervalMs, timeoutMs })", "read", "{ voided: false, outcome, outcomeData } | { voided: true }"],
    ],
  },
  {
    title: "Composites (EventComposer)",
    methods: [
      ["createComposite(spec, account)", "write", "tx hash"],
      ["tryResolveComposite(compositeId, account)", "write", "tx hash"],
      ["getResolvedComposite(compositeId)", "read", "{ resolved, outcome }"],
    ],
  },
  {
    title: "Range markets (DistributionMarket)",
    methods: [
      ["createDistributionMarket(question, boundaryIds, tradingClosesAt, b, account)", "write", "tx hash"],
      ["getCreatedDistributionMarketId(txHash)", "read", "Hex"],
      ["distributionSubsidy(b, nBuckets)", "helper", "bigint — approve this much first"],
      ["distributionBuy(id, bucket, usdgIn, minShares, account)", "write", "tx hash"],
      ["distributionSell(id, bucket, shares, minUsdgOut, account)", "write", "tx hash"],
      ["distributionQuoteBuy(id, bucket, usdgIn)", "read", "{ shares, fee }"],
      ["distributionQuoteSell(id, bucket, shares)", "read", "{ collateralOut, fee }"],
      ["distributionPrices(id)", "read", "number[] (sum to 1)"],
      ["getDistributionMarket(id) · listDistributionMarkets()", "read", "market info (+ boundaries, prices)"],
      ["distributionSharesOf(id, trader) · distributionPayoutOf(id, trader)", "read", "bigint[] · bigint"],
      ["distributionSettle(id, account) · distributionRedeem(id, account)", "write", "tx hash"],
    ],
  },
  {
    title: "Yes/no markets (Market)",
    methods: [
      ["createMarket(eventId, tradingClosesAt, question, account)", "write", "tx hash"],
      ["getCreatedMarketId(txHash)", "read", "Hex"],
      ["depositCollateral(marketId, backingYes, amount, account)", "write", "tx hash — approve first"],
      ["closePosition(marketId, backingYes, amount, account)", "write", "tx hash — before tradingClosesAt only"],
      ["settleMarket(marketId, account) · claim(marketId, account)", "write", "tx hash"],
      ["getMarket(marketId) · listMarkets() · listMarketIds()", "read", "MarketDef(s) — on-chain enumeration"],
      ["payoutOf(marketId, trader)", "read", "bigint"],
    ],
  },
  {
    title: "TreasuryVault",
    methods: [
      ["vaultClaimable(eventId, who)", "read", "{ resolver, committee }"],
      ["vaultBalances()", "read", "{ treasury, insurance }"],
      ["vaultPendingFees(eventId)", "read", "bigint (not yet allocated)"],
    ],
  },
  {
    title: "Collateral (USDG / MockUSDG) & lending guard",
    methods: [
      ["collateralBalance(owner) · collateralAllowance(owner) · collateralAllowanceFor(owner, spender)", "read", "bigint (6 decimals)"],
      ["approveCollateral(amount, account) · approveCollateralFor(spender, amount, account)", "write", "tx hash"],
      ["mintTestCollateral(to, amount, account)", "write", "tx hash — testnet MockUSDG only"],
      ["canLiquidate(stockToken)", "read", "{ allowed, blockingEventId } — StockLendingGuard"],
    ],
  },
  {
    title: "Subscriptions (stub)",
    note: "Push delivery is deliberately deferred — consumers pull.",
    methods: [["subscribe · unsubscribe · isSubscribed", "write", "SubscriptionManager stub"]],
  },
];

const EXPORTS: [name: string, what: string][] = [
  ["SOURCES · sourceId(name) · sourceName(id)", "The 4 source names and their keccak256 IDs"],
  ["encodePriceAtSpec · decodePriceAtSpec · Comparator", "chainlink.price-at.v1 specs (feed, threshold, ≥/≤, at, maxStaleness)"],
  ["buildPriceLadderSpecs · ladderBucketLabels", "N−1 boundary specs for a range market, and their labels"],
  ["encodeCorporateActionSpec · encodeTradingStatusSpec · encodeFedRateSpec (+ decoders)", "The other three sources"],
  ["CHAINLINK_FEED_CATALOG · feedBySymbol · feedByAddress", "All 53 Chainlink Robinhood feeds (symbol, name, class, address, decimals)"],
  ["encodeBoolOutcome · encodeOutcomeV2 · decodeOutcome · encodeOutcomeForVersion", "Outcome payload codec (v1 bool, v2 bool + occurredAt)"],
  ["deployments · getDeployment(chainId) · explorerUrl(chainId)", "Generated addresses (46630, 31337) and Blockscout URLs"],
  ["robinhoodTestnet · robinhood · ROBINHOOD_TESTNET_ID · TESTNET_FAUCET_URL", "Chain definitions"],
  ["eventBusAbi · eventRegistryAbi · disputeManagerAbi · distributionMarketAbi · treasuryVaultAbi · …", "Generated ABIs for every contract (never hand-edited)"],
];

const KIND: Record<M[1], string> = {
  read: "bg-emerald-50 text-emerald-700 border-emerald-200",
  write: "bg-violet-50 text-violet-700 border-violet-200",
  helper: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function SdkReferencePage() {
  const count = GROUPS.reduce((n, g) => n + g.methods.length, 0);
  return (
    <article>
      <DocHeader
        icon={FileCode2}
        eyebrow="Reference · @novakoracle/sdk"
        title="The TypeScript SDK"
        lead={
          <>
            A typed client over the Novak contracts, built on viem. Reads of event state go through the Event Bus only, exactly
            like an on-chain consumer; ABIs and addresses are generated from the contracts and the deployment, never written
            by hand.
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Method groups", value: String(GROUPS.length), hint: `${count} rows below` },
          { label: "Feeds bundled", value: "53", hint: "Chainlink Robinhood mainnet" },
          { label: "Networks", value: "2", hint: "46630 testnet · 31337 anvil" },
          { label: "Tests", value: "18", hint: "vitest: ABIs, codec, source specs, ladders" },
        ]}
      />

      <H2>Install</H2>
      <P>
        The SDK is a pnpm workspace package in this repo (not on npm yet). Inside the monorepo it is linked automatically;
        build it before anything that imports it:
      </P>
      <CodeBlock
        className="mt-3"
        label="terminal"
        code={`pnpm install
pnpm --filter @novakoracle/sdk build      # → sdk/dist
# after any contract change:
forge build && pnpm --filter @novakoracle/sdk gen && pnpm --filter @novakoracle/sdk build`}
      />

      <H2>Quickstart</H2>
      <Tabs defaultValue="read" className="mt-4">
        <TabsList>
          <TabsTrigger value="read">Read an outcome</TabsTrigger>
          <TabsTrigger value="settle">Settle your market</TabsTrigger>
          <TabsTrigger value="trade">Trade a range</TabsTrigger>
          <TabsTrigger value="yesno">Yes/no market</TabsTrigger>
        </TabsList>
        <TabsContent value="read">
          <CodeBlock
            variant="dark"
            code={`import { createPublicClient, http } from "viem";
import { NovakClient, getDeployment, robinhoodTestnet } from "@novakoracle/sdk";

const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });
const client = new NovakClient(publicClient, undefined, getDeployment(robinhoodTestnet.id));

// Pending | Available | Voided — "not yet" vs "never"
const availability = await client.getAvailability(eventId);
const { available, outcome } = await client.resolveOutcome(eventId);`}
          />
        </TabsContent>
        <TabsContent value="settle">
          <CodeBlock
            variant="dark"
            code={`// Off-chain settlement service for any prediction market (Polymarket-style).
const result = await client.waitForOutcome(eventId, { intervalMs: 15_000 });
if (result.voided) {
  await refundEveryone(marketId);          // Novak couldn't decide — never pay a guess
} else {
  await payWinners(marketId, result.outcome);
}`}
          />
        </TabsContent>
        <TabsContent value="trade">
          <CodeBlock
            variant="dark"
            code={`import { NovakClient, getDeployment, robinhoodTestnet } from "@novakoracle/sdk";

const client = new NovakClient(publicClient, walletClient, getDeployment(robinhoodTestnet.id));

const prices = await client.distributionPrices(marketId);          // e.g. [0.13, 0.21, 0.13, 0.27, 0.13, 0.13]
const { shares } = await client.distributionQuoteBuy(marketId, 3, 25_000_000n); // 25 USDG on range #3
await client.distributionBuy(marketId, 3, 25_000_000n, (shares * 98n) / 100n, account); // 2% slippage

// after settlement
await client.distributionRedeem(marketId, account);`}
          />
        </TabsContent>
        <TabsContent value="yesno">
          <CodeBlock
            variant="dark"
            code={`const tx = await client.createMarket(eventId, tradingClosesAt, "Will NVDA be ≥ $234 at the bell?", account);
const marketId = await client.getCreatedMarketId(tx);

await client.approveCollateral(50_000_000n, account);            // 50 USDG
await client.depositCollateral(marketId, true, 50_000_000n, account); // back YES`}
          />
        </TabsContent>
      </Tabs>

      <H2>Method reference</H2>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <H3>{g.title}</H3>
          {g.note && <P className="mt-1 text-sm">{g.note}</P>}
          <DataTable
            columns={["Method", "Kind", "Returns"]}
            mono={[0, 2]}
            rows={g.methods.map(([name, kind, returns]) => [
              name,
              <span key={name} className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${KIND[kind]}`}>
                {kind}
              </span>,
              returns,
            ])}
          />
        </div>
      ))}

      <H2>Other exports</H2>
      <DataTable columns={["Export", "What it is"]} mono={[0]} rows={EXPORTS.map(([n, w]) => [n, w])} />

      <Callout title="Not wrapped on purpose">
        Resolver and committee calls — <C>submitObservation</C>, <C>dispute</C>, <C>submitTier1Vote</C> /{" "}
        <C>submitTier2Vote</C>, <C>escalateTier2</C>, <C>voidAfterTier2Timeout</C> — aren&apos;t part of the consumer client. The
        resolver node calls them directly with the generated <C>eventRegistryAbi</C> / <C>disputeManagerAbi</C>. Anyone can
        call them from a wallet or script the same way.
      </Callout>
    </article>
  );
}
