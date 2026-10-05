import { HelpCircle, ChevronDown } from "lucide-react";
import { DocHeader, H2 } from "@/components/docs/DocPrimitives";

export const metadata = { title: "FAQ — Novak Docs" };

const SECTIONS: { title: string; faqs: { q: string; a: string }[] }[] = [
  {
    title: "The idea",
    faqs: [
      {
        q: "Isn't this what Chainlink does?",
        a: "Chainlink is Robinhood Chain's price oracle, and Novak resolvers read its feeds — it's a data source, not a competitor. Price feeds answer \"what is the price now\"; Chainlink's own docs say they don't provide corporate-action calendars or pause triggers. Novak turns questions like \"was NVDA ≥ $230 at the close?\" or \"did TSLA's multiplier change this week?\" into finalized, disputable facts that every protocol reads the same way.",
      },
      {
        q: "How is this different from UMA / Polymarket's oracle?",
        a: "An optimistic oracle accepts a single bonded proposer's answer and, for hard disputes, escalates to a vote weighted by governance-token holdings — which is how a $200M+ Polymarket market (the Zelenskyy suit market, 2025) was decided against widely reported facts. Novak starts from a quorum of resolvers with evidence, escalates to randomly drawn resolver committees, and if they can't agree the event is Voided and markets refund. It's deliberately narrower: machine-checkable facts about stock tokens, not arbitrary questions.",
      },
      {
        q: "Why would another prediction market use Novak?",
        a: "Resolution and disputes are the expensive, trust-critical part of running a market. A market can create (or reuse) Novak events and settle against EventBus.getAvailability / readOutcome — on-chain with one interface, or off-chain with the SDK's waitForOutcome — and get quorum, disputes, committees and the VOID path for free. See Integrate your market.",
      },
    ],
  },
  {
    title: "Markets",
    faqs: [
      {
        q: "What is a range (distribution) market?",
        a: "A market on where a price lands, split into up to 10 ranges with their own shares. An LMSR market maker keeps the range prices summing to 1, so the chart is the market's probability distribution. It settles on N−1 ordinary threshold events: the winning range is the number of boundaries that resolved TRUE.",
      },
      {
        q: "What happens to my money if an event is voided?",
        a: "You're never paid on a guess. In a yes/no market every depositor gets their own stake back. In a range market every share redeems at 1/N USDG, whatever range it's in. The same happens if a range market's boundaries come back inconsistent.",
      },
      {
        q: "Can I trade after the result is known?",
        a: "No. Trading stops at the market's close time and also the moment any of its events is decided — this closed a real fund-loss bug where losers could withdraw after the outcome was public.",
      },
      {
        q: "Are the buy / hold / avoid insights advice?",
        a: "No. They compare the market's price with a simple lognormal model around the live Chainlink price, using the feed's realized volatility and the time left. They flag gaps over 5 points. The model knows nothing about news or earnings.",
      },
      {
        q: "Is the data on /markets real?",
        a: "Yes. Markets are enumerated on-chain on Robinhood Chain testnet and prices come from the live Chainlink feeds on mainnet. Collateral is MockUSDG — test money with no value; mint it free in the app.",
      },
    ],
  },
  {
    title: "Resolvers, disputes & fees",
    faqs: [
      {
        q: "How many resolvers are there?",
        a: "Two authorized resolvers run today, both operated by the team. The quorum and committee rules are designed for many independent operators; adding them is the next step. Until committee selection uses commit-reveal, the pool is kept at ≤ 7 so a committee is simply the whole pool.",
      },
      {
        q: "How long does resolution take?",
        a: "Resolvers observe shortly after the event time; the dispute window is set per event (a few minutes in the demo markets; the app default is 10 minutes); then the keeper finalizes and settles automatically. A disputed event adds up to 1 hour (Tier 1) and 2 more hours (Tier 2).",
      },
      {
        q: "Who earns the fees?",
        a: "Every market fee goes to the TreasuryVault, attributed to the events the market settled on, and is split in thirds per event: resolvers who reported the final outcome, committee members who voted it (or the insurance reserve if undisputed), and the treasury. Wrong or silent resolvers earn nothing from that event.",
      },
      {
        q: "Is decentralized dispute arbitration finished?",
        a: "No. The bonded two-tier committee ladder replaced single-owner arbitration and never falls back to a token vote, but committee selection is still block-data pseudo-randomness (weak on Arbitrum chains, and Chainlink VRF isn't available on Robinhood Chain), bonds are flat, and there is no staking or reputation yet. See the threat model.",
      },
    ],
  },
  {
    title: "Technical",
    faqs: [
      {
        q: "What chain does it run on?",
        a: "Robinhood Chain testnet (chain ID 46630). Resolvers read their data — Chainlink stock feeds, ERC-8056 stock tokens, Robinhood's asset registry — from Robinhood Chain mainnet, read-only. Local anvil (31337) is supported for development.",
      },
      {
        q: "Is there a REST API?",
        a: "No. Everything is read on-chain (or through the SDK). The Contract API page documents the surface with real function signatures; its REST examples are illustrative of a future indexer.",
      },
      {
        q: "Why is K-of-N composition not available?",
        a: "Out of scope for this pass and tracked as a post-MVP extension. AND / OR / NOT / BEFORE / WITHIN cover the current markets.",
      },
      {
        q: "Has it been audited?",
        a: "No. It has 138 Foundry tests (unit, integration, fuzz and adversarial) plus SDK and resolver tests, and a written threat model — but no external audit. It is testnet software.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <article>
      <DocHeader icon={HelpCircle} eyebrow="Reference · FAQ" title="Frequently asked questions" lead="Straight answers, including the uncomfortable ones." />
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <H2>{s.title}</H2>
          <div className="mt-4 flex flex-col gap-2">
            {s.faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-gray-200 bg-white px-4 py-3 open:border-violet-200 open:bg-violet-50/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-4 w-4 flex-none text-gray-400 transition group-open:rotate-180 group-open:text-violet-600" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
