import { BarChart3 } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { C, Callout, DataTable, DocHeader, H2, H3, P, Panel, StatGrid, Steps, TwoCol } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Range markets (LMSR) — Novak Docs" };

const THRESHOLDS = [230, 232, 234, 236, 238];
const LABELS = ["< $230", "$230–232", "$232–234", "$234–236", "$236–238", "≥ $238"];
const PRICES = [0.13, 0.21, 0.13, 0.27, 0.13, 0.13];
const WIN = 3; // spot $235.19 -> 3 boundaries TRUE

/** The example ladder: boundaries, ranges, and which range a $235.19 close lands in. */
function LadderFigure() {
  return (
    <div className="mt-6 rounded-2xl border border-violet-100 bg-white p-5">
      <p className="font-mono text-[11px] uppercase tracking-wide text-gray-500">Example: &ldquo;Where will NVDA be at the bell?&rdquo; — 5 boundary events, 6 ranges</p>
      <div className="mt-4 flex h-36 items-end gap-1.5">
        {PRICES.map((p, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
            <span className={`mb-1 font-mono text-[11px] font-semibold ${i === WIN ? "text-emerald-700" : "text-violet-700"}`}>{Math.round(p * 100)}%</span>
            <div
              className={`w-full rounded-t-md ${i === WIN ? "bg-emerald-500" : "bg-gradient-to-t from-violet-500 to-violet-300"}`}
              style={{ height: `${(p / Math.max(...PRICES)) * 78}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 border-t-2 border-gray-800 pt-1">
        {LABELS.map((l, i) => (
          <span key={l} className={`flex-1 text-center font-mono text-[10px] sm:text-[11px] ${i === WIN ? "font-bold text-emerald-700" : "text-gray-600"}`}>
            {l}
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-1.5 sm:grid-cols-5">
        {THRESHOLDS.map((t, i) => (
          <div
            key={t}
            className={`rounded-lg border px-2 py-1.5 text-center font-mono text-[11px] ${i < WIN ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-600"}`}
          >
            NVDA ≥ ${t} at T? <strong>{i < WIN ? "TRUE" : "FALSE"}</strong>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-600">
        NVDA closes at <strong>$235.19</strong> → 3 boundaries TRUE → range #3 (<strong>$234–236</strong>) wins and pays 1 USDG per
        share. Bar heights are the live prices: they always sum to 100%.
      </p>
    </div>
  );
}

export default function DistributionMarketsPage() {
  return (
    <article>
      <DocHeader
        icon={BarChart3}
        eyebrow="Markets · DistributionMarket"
        title="Range markets: trade where a price lands"
        lead={
          <>
            A yes/no market asks &ldquo;will NVDA be above $230?&rdquo;. A range market asks{" "}
            <strong className="text-ink">&ldquo;where will NVDA be?&rdquo;</strong> — it splits the answer into up to 10 price
            ranges, each with its own shares. An automated market maker (LMSR) keeps the range prices summing to 1, so the
            chart <em>is</em> the market&apos;s probability distribution. It settles on Novak&apos;s dispute layer, unchanged.
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Ranges", value: "2–10", hint: "1–9 boundary events (MAX_BOUNDARIES = 9)" },
          { label: "Pays", value: "1 USDG", hint: "per share of the winning range" },
          { label: "Trade fee", value: "1%", hint: "→ TreasuryVault thirds" },
          { label: "Creator subsidy", value: "b · ln N", hint: "LMSR's maximum loss, b ≥ 1 USDG" },
        ]}
      />

      <H2>From threshold events to ranges</H2>
      <P>
        A range market with N ranges is built from N−1 ordinary yes/no Novak events — the boundaries — with ascending
        thresholds: boundary <C>i</C> is &ldquo;price ≥ threshold<sub>i</sub> at time T?&rdquo;. The winning range is simply{" "}
        <strong>the number of boundaries that resolved TRUE</strong>. Each boundary goes through the normal resolver quorum
        and, if challenged, the committees — and any other market can reuse the same boundary events.
      </P>
      <LadderFigure />

      <H2>Pricing: the LMSR market maker</H2>
      <P>
        Let <C>q_i</C> be the shares outstanding in range <C>i</C> and <C>b</C> the liquidity parameter. The market maker
        charges according to the cost function
      </P>
      <div className="mt-4 overflow-x-auto rounded-xl border border-violet-100 bg-violet-50/40 p-4 font-mono text-sm text-ink">
        <p>C(q) = b · ln( Σ<sub>j</sub> e<sup>q_j / b</sup> )</p>
        <p className="mt-2">price<sub>i</sub> = e<sup>q_i / b</sup> / Σ<sub>j</sub> e<sup>q_j / b</sup> &nbsp;&nbsp;(all prices sum to 1)</p>
        <p className="mt-2">cost of Δ shares of i = C(q + Δ·e<sub>i</sub>) − C(q)</p>
      </div>
      <TwoCol
        left={
          <Panel title="Buy">
            <C>buy(market, range, usdgIn, minShares)</C>. 1% of <C>usdgIn</C> is the fee; the rest buys shares, solved in closed
            form so <C>C(q + Δ) = C(q) + net</C>. Shares round <em>down</em>. Reverts below <C>minShares</C> (slippage guard — the
            app uses 2%).
          </Panel>
        }
        right={
          <Panel title="Sell">
            <C>sell(market, range, shares, minUsdgOut)</C> pays <C>C(q) − C(q − Δ)</C> minus 1%. Proceeds round down. You can exit
            any time before close — the price just reflects what others now believe.
          </Panel>
        }
      />
      <Callout title="Live example (NVDA market on testnet)">
        Range &ldquo;&lt; $230&rdquo; trades at 13%. Spending 10 USDG on it returns ≈ 71.48 shares (0.10 USDG fee) — worth 71.48
        USDG if NVDA closes below $230, about 7× the stake. Average price ≈ 0.139: a little above 0.13 because buying pushes
        the price up.
      </Callout>

      <H3>Choosing b</H3>
      <P>Larger <C>b</C> = deeper market (smaller price moves per trade) but a bigger subsidy for the creator.</P>
      <DataTable
        columns={["b (USDG)", "Subsidy, 6 ranges", "Subsidy, 10 ranges", "Feel"]}
        mono={[0, 1, 2]}
        rows={[
          ["100", "≈ 179 USDG", "≈ 230 USDG", "small, moves fast"],
          ["500 (demo markets)", "≈ 896 USDG", "≈ 1,151 USDG", "balanced"],
          ["1,000", "≈ 1,792 USDG", "≈ 2,303 USDG", "deep"],
        ]}
      />

      <H2>Lifecycle</H2>
      <Steps
        items={[
          { tag: "creator", title: "Create", body: <>Create the boundary ladder in one transaction (<C>createEvents</C>), approve USDG, then <C>createMarket(question, boundaryIds, tradingClosesAt, b)</C>. The contract pulls <C>⌈b·ln N⌉ + 1</C> units and every range starts at 1/N.</> },
          { tag: "anyone", title: "Trade", body: "Buy and sell any range. Every trade emits Trade(…, pricesAfter), which the app uses for the probability history." },
          { tag: "automatic", title: "Trading stops", body: <>At <C>tradingClosesAt</C> — and also the moment <em>any</em> boundary is decided, so nobody can trade on a known outcome (the same fix as the yes/no market&apos;s fund-loss bug).</> },
          { tag: "keeper", title: "Settle", body: <><C>settle(market)</C> reads every boundary in one call through <C>Settlement.getSettlements</C>. Fees go to the TreasuryVault tagged with the boundary events; leftover subsidy goes back to the creator.</> },
          { tag: "traders", title: "Redeem", body: <><C>redeem(market)</C> pays each wallet once: 1 USDG per winning share, or 1/N per share if voided.</> },
        ]}
      />

      <H2>Settlement rules</H2>
      <DataTable
        columns={["Boundaries at settle", "Result", "Each share pays"]}
        rows={[
          ["Any still Pending", "settle() reverts — try again later", "—"],
          ["All Available, TRUEs form a prefix (T,T,T,F,F)", "Settled: winning range = number of TRUEs", "1 USDG if in the winning range, else 0"],
          ["Any Voided or Expired", "Voided", "1/N USDG, whatever range it is in"],
          ["Inconsistent — a TRUE above a FALSE (T,F,T,…)", "Voided", "1/N USDG"],
        ]}
      />

      <H2>Why it can always pay</H2>
      <P>
        The market keeps a reserve: the creator&apos;s subsidy plus every net trade (fees are held separately). The subsidy is
        exactly <C>C(0) = b·ln N</C>, so after any trades the reserve equals <C>C(q)</C>. For the LMSR,{" "}
        <C>C(q) ≥ max q_i ≥ average q_i</C> — enough to pay the winning range in full, or 1/N on every share if voided. The
        contract doesn&apos;t rely on the proof alone: <strong>every buy and sell re-checks <C>reserve ≥ C(q)</C></strong> and reverts
        otherwise, and rounding always favours the market. Foundry fuzz tests run random trade sequences against every
        outcome.
      </P>

      <H2>Insights: buy, hold or avoid</H2>
      <P>
        Each market page compares the market&apos;s price for every range with a simple model: a lognormal distribution centred on
        the live Chainlink spot price, using that feed&apos;s own realized volatility and the time left until T.
      </P>
      <DataTable
        columns={["Model − market", "Label", "Meaning"]}
        mono={[0]}
        rows={[
          ["> +5 points", "Underpriced — consider buying", "the model thinks this range is more likely than the price says"],
          ["within ±5 points", "Fairly priced — hold", "no meaningful gap"],
          ["< −5 points", "Overpriced — consider selling / avoid", "the market is paying more than the model thinks it's worth"],
        ]}
      />
      <Callout tone="warn">
        Informational only, not financial advice. The model ignores news, earnings and everything else traders know — that&apos;s
        exactly the information a market adds.
      </Callout>

      <H2>Create one</H2>
      <P>
        In the app: <strong>Markets → Create market → Price range</strong> — pick any of the 34 Chainlink stock/SGOV feeds, a time
        T and a liquidity; the ranges are centred on the live price. Or with the SDK:
      </P>
      <CodeBlock
        label="create-range-market.ts"
        code={`import { NovakClient, buildPriceLadderSpecs, ladderBucketLabels, feedBySymbol, getDeployment } from "@novakoracle/sdk";

const dep = getDeployment(46630);                       // Robinhood Chain testnet addresses
const client = new NovakClient(publicClient, walletClient, dep);
const nvda = feedBySymbol("NVDA")!;                     // Chainlink feed on Robinhood Chain mainnet
const at = BigInt(Math.floor(Date.now() / 1000) + 48 * 3600);
const thresholds = [230n, 232n, 234n, 236n, 238n].map((d) => d * 10n ** 8n); // 8 decimals

// 1. Five boundary events "NVDA >= $X at T", one transaction
const specs = buildPriceLadderSpecs({ feed: nvda.address, thresholds, at, maxStaleness: 4n * 3600n });
const tx = await client.createEvents(specs, account);
const boundaryIds = await client.getCreatedEventIds(tx);

// 2. Fund the LMSR subsidy and open the market
const b = 500_000_000n;                                 // 500 USDG (6 decimals)
const approve = await client.approveCollateralFor(dep.distributionMarket, client.distributionSubsidy(b, 6), account);
await publicClient.waitForTransactionReceipt({ hash: approve });
const mtx = await client.createDistributionMarket("Where will NVDA be at the bell?", boundaryIds, at - 60n, b, account);
const marketId = await client.getCreatedDistributionMarketId(mtx);

console.log(ladderBucketLabels(thresholds));            // ["< $230", "$230–$232", …, "≥ $238"]`}
      />

      <H2>Contract reference</H2>
      <DataTable
        columns={["Function", "Kind", "Notes"]}
        mono={[0]}
        rows={[
          ["createMarket(question, boundaryIds[], tradingClosesAt, b)", "write", "1–9 ascending boundaries, all Pending; pulls the subsidy"],
          ["buy(id, range, usdgIn, minShares)", "write", "fee = 1% of usdgIn"],
          ["sell(id, range, shares, minUsdgOut)", "write", "fee = 1% of proceeds"],
          ["settle(id)", "write", "anyone, once every boundary is decided"],
          ["redeem(id)", "write", "once per wallet"],
          ["prices(id)", "view", "wad, sums to 1e18"],
          ["quoteBuy(id, range, usdgIn) · quoteSell(id, range, shares)", "view", "exact contract math"],
          ["sharesOf(id, who) · payoutOf(id, who)", "view", "position and redeemable amount"],
          ["getMarket · getBoundaries · getOutstanding · marketCount · getMarketIds", "view", "enumeration"],
        ]}
      />
      <P className="text-sm text-gray-500">
        Like every consumer, DistributionMarket reads outcomes only through <C>Settlement</C> → <C>IEventBus</C> — enforced by{" "}
        <C>test_holdsOnlySettlementReference</C>.
      </P>
    </article>
  );
}
