import { Layers } from "lucide-react";
import { LayerDiagram } from "@/components/architecture/LayerDiagram";
import { C, Callout, DataTable, DocHeader, H2, H3, P, Steps } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Architecture — Novak Docs" };

function Zone({ title, sub, items, tone }: { title: string; sub: string; items: string[]; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide">{title}</p>
      <p className="text-xs opacity-75">{sub}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-gray-800">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <article>
      <DocHeader
        icon={Layers}
        eyebrow="Architecture"
        title="Read mainnet, decide once, serve everyone"
        lead="Novak has three zones: real-world sources on Robinhood Chain mainnet (read only), an off-chain resolver network, and the contracts on Robinhood Chain testnet that store, dispute and serve the answers."
      />

      <H2>The big picture</H2>
      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1.3fr] lg:items-stretch">
        <Zone
          title="1 · Sources"
          sub="Robinhood Chain mainnet (4663) + public APIs"
          tone="border-gray-200 bg-gray-50 text-gray-700"
          items={["53 Chainlink feeds (stocks, SGOV, crypto)", "ERC-8056 stock tokens — multiplier logs", "Robinhood asset API — trading status", "FRED — Fed target rate"]}
        />
        <div className="hidden items-center text-2xl text-violet-300 lg:flex">→</div>
        <Zone
          title="2 · Resolver network"
          sub="independent Node.js daemons"
          tone="border-violet-200 bg-violet-50 text-violet-900"
          items={["discover events from logs", "observe via adapters + evidence hash", "vote in dispute committees", "keeper: finalize / escalate / settle", "claim fee rewards"]}
        />
        <div className="hidden items-center text-2xl text-violet-300 lg:flex">→</div>
        <Zone
          title="3 · Contracts"
          sub="Robinhood Chain testnet (46630)"
          tone="border-ink bg-white text-ink"
          items={[
            "EventRegistry — specs, quorum, finality",
            "DisputeManager — bonded committees",
            "EventComposer + EventBus — compose & read",
            "TreasuryVault — fee thirds",
            "DistributionMarket · Market · StockLendingGuard",
          ]}
        />
      </div>
      <P>
        Why split mainnet and testnet? Chainlink&apos;s Robinhood stock feeds and the real ERC-8056 stock tokens only exist
        on mainnet, so resolvers read the <em>real</em> data there and write their observations to testnet, where
        everything else runs on test money (MockUSDG). Moving the contracts to mainnet later changes an RPC URL, not the
        design.
      </P>

      <H2>The five layers</H2>
      <P>Click a layer to see its job and the functions it exposes. A layer only talks to the one directly beneath it.</P>
      <div className="mt-6">
        <LayerDiagram detailed />
      </div>

      <H2>Contracts and their roles</H2>
      <DataTable
        columns={["Contract", "Job", "Reads", "Called by"]}
        mono={[0]}
        rows={[
          ["EventRegistry", "Event specs, observations, quorum, finalize / expire, per-resolver outcomes", "—", "anyone (create), resolvers (observe), keeper"],
          ["DisputeManager", "Bonds, committee draw, Tier-1/Tier-2 votes, VOID, pull payouts", "Registry", "disputers, committee resolvers, keeper"],
          ["EventComposer", "AND / OR / NOT / BEFORE / WITHIN composites, cached resolution", "Registry", "anyone, keeper (tryResolve)"],
          ["EventBus", "One read API for primitives + composites: readOutcome, getAvailability", "Registry, Composer", "every consumer (through Settlement)"],
          ["Settlement", "Thin adapter: (availability, bool outcome) for one or many events", "EventBus", "markets"],
          ["TreasuryVault", "Fee thirds per event, insurance reserve, dispute-bond sweep, claims", "Registry, Composer, DisputeManager", "markets (deposit), resolvers (claim)"],
          ["DistributionMarket", "LMSR range markets over threshold ladders", "Settlement only", "traders, keeper (settle)"],
          ["Market", "USDG yes/no parimutuel markets", "Settlement only", "traders, keeper (settle)"],
          ["StockLendingGuard", "canLiquidate(token): pause while a risky event is open", "EventBus only", "lending protocols"],
        ]}
      />

      <H2>The one rule</H2>
      <Callout tone="ok" title="Applications depend on the Event Bus — never on a resolver, the Registry or the Composer.">
        A market holds a <C>Settlement</C> reference (which holds an <C>IEventBus</C>), so the resolver network can add
        sources, change quorum rules or add resolvers without redeploying a single market. Consumers may additionally{" "}
        <em>push</em> fees into <C>ITreasuryVault</C>; the vault — protocol infrastructure — is the one that reads the
        Registry and DisputeManager to decide who gets paid.
      </Callout>
      <DataTable
        columns={["Consumer", "Holds only", "Regression test"]}
        mono={[0, 1, 2]}
        rows={[
          ["Market", "Settlement", "Market.t.sol::test_market_onlyHoldsSettlementReference"],
          ["DistributionMarket", "Settlement", "DistributionMarket.t.sol::test_holdsOnlySettlementReference"],
          ["StockLendingGuard", "IEventBus", "StockLendingGuard.t.sol::test_guard_onlyHoldsEventBusReference"],
          ["ExternalPredictionMarket (example)", "IEventBus", "ExternalPredictionMarket.t.sol::test_holdsOnlyEventBusReference"],
        ]}
      />

      <H2>One range market, end to end</H2>
      <Steps
        items={[
          { tag: "SDK", title: "Create the ladder", body: <>The creator builds N−1 threshold events (&ldquo;NVDA ≥ $230 at T&rdquo;, &ldquo;≥ $232&rdquo;, …) with <C>buildPriceLadderSpecs</C> and creates them in one transaction with <C>createEvents</C>.</> },
          { tag: "DistributionMarket", title: "Open the market", body: <><C>createMarket(question, boundaryIds, tradingClosesAt, b)</C> pulls the LMSR subsidy <C>b·ln N</C> in USDG. Every range starts at 1/N.</> },
          { tag: "traders", title: "Trade until close", body: "Buy or sell any range; prices move with the LMSR and always sum to 1. A 1% fee accrues per trade." },
          { tag: "resolvers", title: "Observe at T", body: "After T each resolver finds the Chainlink round in effect at T on mainnet and submits TRUE/FALSE per boundary with an evidence hash." },
          { tag: "Registry", title: "Quorum → dispute window → final", body: "Identical answers from the quorum propose the outcome; if nobody disputes before the window ends, the keeper finalizes it." },
          { tag: "keeper", title: "Settle", body: "Winning range = number of TRUE boundaries. Fees go to the TreasuryVault, tagged with the boundary events; leftover subsidy returns to the creator." },
          { tag: "everyone", title: "Redeem & claim", body: "Winners redeem 1 USDG per share; resolvers who reported the final answer claim their third from the vault." },
        ]}
      />

      <H2>Off-chain pieces</H2>
      <H3>Resolver node (resolver/)</H3>
      <P>
        One process per resolver key. Duties run on a poll loop: discovery, resolve, committee voting, keeper (one node with{" "}
        <C>RESOLVER_KEEPER=true</C>), rewards. It serves <C>/health</C> and <C>/evidence/:hash</C> so anyone can check what a
        resolver saw. See <a href="/docs/resolvers">Resolver network</a>.
      </P>
      <H3>Frontend data routes (frontend/src/app/api/)</H3>
      <DataTable
        columns={["Route", "Returns", "Cache"]}
        mono={[0, 2]}
        rows={[
          ["/api/feeds", "Latest round for every Chainlink Robinhood feed (list from Chainlink's directory, one mainnet multicall)", "60 s"],
          ["/api/feeds/history", "Recent rounds for one feed + realized volatility (drives charts and insights)", "300 s"],
          ["/api/rates", "Fed funds target range (FRED) + effective rate (NY Fed)", "30 min"],
          ["/api/rh-assets", "Corporate-action calendar: Robinhood's asset registry + each token's ERC-8056 multiplier state", "5 min"],
        ]}
      />
      <H3>SDK (@novakoracle/sdk)</H3>
      <P>
        Generated ABIs and deployment addresses (never hand-edited), a typed <C>NovakClient</C>, source-spec encoders, the
        53-feed Chainlink catalog and ladder helpers. See the <a href="/docs/sdk">SDK reference</a>.
      </P>
    </article>
  );
}
