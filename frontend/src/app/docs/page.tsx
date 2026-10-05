import { BookOpen } from "lucide-react";
import { C, Callout, CardGrid, DataTable, DocHeader, Flow, H2, P, Panel, StatGrid, TwoCol } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Introduction — Novak Docs" };

export default function DocsIntroPage() {
  return (
    <article className="min-w-0 max-w-none">
      <DocHeader
        icon={BookOpen}
        eyebrow="Introduction"
        title="The event & dispute layer for tokenized stocks"
        lead={
          <>
            <strong className="text-ink">Chainlink tells your contract the price. Novak tells it what happened.</strong>{" "}
            Novak resolves real-world facts about Robinhood Stock Tokens — dividends and splits, trading halts, &ldquo;was
            NVDA above $230 at the close&rdquo; — <em>once</em>, lets anyone dispute them through bonded committees, and
            serves the final answer to every contract that asks. Prediction markets, range markets and lending
            protocols all read the same answer instead of each running its own oracle.
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Chainlink feeds read", value: "53", hint: "33 stocks · SGOV · 19 crypto (mainnet, read-only)" },
          { label: "Dispute tiers", value: "2", hint: "≤7 then ≤15 resolvers · 66% to decide" },
          { label: "Fee split", value: "⅓ · ⅓ · ⅓", hint: "resolvers · committee/insurance · treasury" },
          { label: "Contract tests", value: "138", hint: "Foundry · + 35 SDK/resolver tests" },
        ]}
      />

      <H2>The problem</H2>
      <P>
        Robinhood Stock Tokens trade around the clock on Robinhood Chain, but the events that move them happen off-chain:
        a dividend changes the token&apos;s multiplier, a halt stops trading, earnings land after the bell. Chainlink&apos;s
        stock feeds answer one question — <em>what is the price right now</em> — and their own docs say they don&apos;t
        provide corporate-action calendars or pause triggers. So every app that needs &ldquo;did X happen?&rdquo; either
        trusts a single admin key, or bolts on a general-purpose optimistic oracle whose hard disputes end in a
        token-holder vote.
      </P>

      <H2>What Novak does</H2>
      <Flow
        nodes={[
          { title: "Real-world source", sub: "Chainlink · ERC-8056 · RH API · FRED" },
          { title: "Resolver quorum", sub: "N-of-M exact match", tone: "violet" },
          { title: "Dispute window", sub: "per event (e.g. 10 min)", tone: "violet" },
          { title: "Committees", sub: "Tier 1 ≤7 · Tier 2 ≤15", tone: "violet" },
          { title: "Finalized fact", sub: "stored once", tone: "ink" },
          { title: "Every consumer", sub: "EventBus.readOutcome", tone: "emerald" },
        ]}
      />
      <P>
        Each fact is a Novak <strong>event</strong> with a precise spec (source, threshold, time). Independent resolvers
        observe the source and submit what they saw plus an evidence hash; once enough agree, the outcome is proposed.
        Anyone can challenge it with a bond during the dispute window, which hands the question to a randomly drawn
        committee of resolvers. If even the larger second committee can&apos;t reach 66%, the event is{" "}
        <C>Voided</C> — consumers refund instead of paying a guess. There is no token vote at any step.
      </P>

      <H2>What ships today</H2>
      <DataTable
        columns={["Piece", "What it does", "Where"]}
        mono={[2]}
        rows={[
          ["Event layer", "Registry, quorum, finalization, composition (AND / OR / NOT / BEFORE / WITHIN), pull-based Event Bus.", "contracts/"],
          ["Dispute layer", "Bonded Tier-1 → Tier-2 committee ladder with a VOID floor and pull payments.", "contracts/DisputeManager.sol"],
          ["TreasuryVault", "Splits every market fee in thirds per event and pays the people who got it right.", "contracts/TreasuryVault.sol"],
          ["Range markets", "LMSR market over N price ranges (“Where will NVDA close?”), settled by threshold events.", "derivatives/DistributionMarket.sol"],
          ["Yes/no markets", "USDG parimutuel market on any event, with refunds on VOID.", "derivatives/Market.sol"],
          ["Lending guard", "Pauses liquidations of a stock token while a risky event is open.", "consumers/StockLendingGuard.sol"],
          ["Resolver node", "Discovers events, observes 4 real sources, votes in committees, keeps, claims rewards.", "resolver/"],
          ["SDK", "Typed client, spec encoders, the 53-feed catalog, ladder helpers.", "sdk/ (@novak/sdk)"],
        ]}
      />

      <H2>Two ways to ask an oracle</H2>
      <TwoCol
        left={
          <Panel title="Price oracle">
            <p className="font-medium text-ink">&ldquo;What is NVDA&apos;s price, right now?&rdquo;</p>
            <p className="mt-1">Answered per request. Every consumer re-reads and re-interprets it.</p>
          </Panel>
        }
        right={
          <Panel title="Novak" accent>
            <p className="font-medium text-ink">&ldquo;Was NVDA ≥ $230 at Friday&apos;s close — and did it pay a dividend that week?&rdquo;</p>
            <p className="mt-1">Answered once, disputable, then a standing on-chain fact any contract can read or compose.</p>
          </Panel>
        }
      />

      <H2>Novak vs a token-vote oracle</H2>
      <DataTable
        columns={["", "Novak", "Optimistic oracle with token-vote escalation"]}
        rows={[
          ["Who answers first", "A quorum of authorized resolvers, each posting evidence", "A single bonded proposer"],
          ["Hard disputes go to", "Randomly drawn resolver committees (≤7, then ≤15)", "A vote weighted by governance-token holdings"],
          ["If nobody can agree", "Event is Voided → markets refund", "The vote still picks an answer"],
          ["Who gets paid", "Resolvers and voters who matched the final outcome, from fees", "Proposer/disputer bonds; voter rewards"],
          ["Scope", "Narrow: stock-token facts with machine-checkable sources", "General: any question in plain language"],
        ]}
      />

      <Callout tone="warn" title="Honest status">
        Testnet only (Robinhood Chain testnet, chain 46630); sources are read from mainnet. Two resolvers run today, both
        operated by the team — the quorum and committee rules are built for many independent operators, and onboarding
        them is next. Committee selection uses block-data randomness, which is weak on Arbitrum chains. The contracts are
        unaudited. See the <a href="/docs/threat-model">threat model</a>.
      </Callout>

      <H2>Where to go next</H2>
      <CardGrid
        items={[
          { href: "/docs/architecture", tag: "Start", title: "Architecture", body: "Mainnet sources → resolvers → testnet contracts, and the one rule every consumer follows." },
          { href: "/docs/resolvers", tag: "Protocol", title: "Resolver network", body: "How facts are observed, agreed on, evidenced and paid for." },
          { href: "/docs/disputes", tag: "Protocol", title: "Disputes & committees", body: "Bonds, the 66% rule, Tier-2 escalation and the VOID floor." },
          { href: "/docs/distribution-markets", tag: "Markets", title: "Range markets", body: "LMSR pricing over threshold-event ladders, with a worked example." },
          { href: "/docs/integrate", tag: "Build", title: "Integrate your market", body: "Settle your own prediction market on Novak outcomes." },
          { href: "/docs/contracts", tag: "Reference", title: "Deployed contracts", body: "Every live address on Robinhood Chain testnet." },
        ]}
      />
    </article>
  );
}
