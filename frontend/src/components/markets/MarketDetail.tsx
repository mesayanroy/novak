"use client";

import { useState } from "react";
import Link from "next/link";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import dynamic from "next/dynamic";
import type { Hex } from "@novak/sdk";
import { CompositionTree, type CompositionNode } from "@/components/markets/CompositionTree";
import { MarketPositionCard } from "@/components/MarketPositionCard";
import { SettlementSimulator } from "@/components/markets/SettlementSimulator";
import { MarketStatusLabel } from "@/components/markets/MarketCard";
import { MarketVisualizer } from "@/components/markets/MarketVisualizer";

// Below-the-fold explainer sections — split out of the initial bundle so the
// live market detail/trading UI above the fold isn't gated on their JS.
const OracleArchitectureGuide = dynamic(
  () => import("@/components/markets/OracleArchitectureGuide").then((m) => m.OracleArchitectureGuide),
);
const DistributionMarketFAQ = dynamic(
  () => import("@/components/markets/DistributionMarketFAQ").then((m) => m.DistributionMarketFAQ),
);
import { explorerUrl, marketAbi } from "@novak/sdk";
import { useReadContract } from "wagmi";
import { NOVAK_CHAIN_ID, novakAddresses } from "@/lib/addresses";
import { OP_LABEL, USDG_DECIMALS, fmtTime, fmtUsdg, useMarket, type EventNode } from "@/lib/novak";
import { shortHex, cn } from "@/lib/utils";
import {
  GitBranch,
  Terminal,
  BarChart3,
  ShieldCheck,
  HelpCircle,
  Cpu,
  Layers,
  ArrowLeft,
  DollarSign,
  Info,
} from "lucide-react";

function toTree(e: EventNode): CompositionNode {
  return {
    id: e.id,
    title: e.kind === "primitive" ? `${e.title} — ${e.source}` : "Composite",
    kind: e.kind,
    op: e.op !== undefined ? OP_LABEL[e.op] : undefined,
    windowSeconds: e.windowSeconds,
    eventStatus: e.status,
    compositeStatus: e.compositeStatus,
    children: e.children?.map(toTree),
  };
}

type DetailTab = "visualizer" | "logic" | "oracle" | "faq";

export function MarketDetail({ marketId }: { marketId: Hex }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("visualizer");
  const { data: market, isLoading, error } = useMarket(marketId);
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  const { data: feeBps } = useReadContract({
    address: novakAddresses.market,
    abi: marketAbi,
    functionName: "feeBps",
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <p className="font-mono text-sm text-gray-500 animate-pulse">
          Loading market and reading contract data from chain…
        </p>
      </div>
    );
  }

  if (error || !market || market.createdAt === 0n) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm text-gray-600">
          Market {shortHex(marketId)} not found on chain {NOVAK_CHAIN_ID}.{" "}
          <Link href="/markets" className="underline font-semibold text-ink">
            Back to markets
          </Link>
        </p>
      </div>
    );
  }

  const pool = (v: bigint) => Number(v) / 10 ** USDG_DECIMALS;
  const totalUsdg = market.yesPool + market.noPool;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Top Breadcrumb & Return Link */}
      <div className="mb-4">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Market Listing
        </Link>
      </div>

      {/* Header Info Banner */}
      <div className="border border-gray-300 bg-paper p-6 rounded-sm shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-xs text-gray-500 uppercase tracking-wider font-semibold">
            <MarketStatusLabel market={market} />
            {market.isExample && <ExampleDataBadge />}
          </span>
          <div className="flex items-center gap-2 font-mono text-xs text-gray-500">
            <span className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-ink">
              {market.event.kind === "composite" ? "Composite Event" : "Primitive Event"}
            </span>
            <span>·</span>
            <span>Chain {NOVAK_CHAIN_ID}</span>
          </div>
        </div>

        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl text-ink max-w-4xl">
          {market.question || market.event.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-xs text-gray-600 border-t border-gray-200 pt-3">
          <span>
            Market: <strong className="text-ink">{shortHex(market.marketId, 8, 6)}</strong>
          </span>
          <span>·</span>
          <span>
            Event: <strong className="text-ink">{shortHex(market.eventId, 8, 6)}</strong>
          </span>
          <span>·</span>
          <span>
            Total Volume: <strong className="text-emerald-700">{fmtUsdg(totalUsdg)} USDG</strong>
          </span>
          {explorer && (
            <>
              <span>·</span>
              <a
                className="underline text-gray-600 hover:text-ink flex items-center gap-1"
                href={`${explorer}/address/${novakAddresses.market}`}
                target="_blank"
                rel="noreferrer"
              >
                Market Contract ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <TabButton
          active={activeTab === "visualizer"}
          onClick={() => setActiveTab("visualizer")}
          icon={<BarChart3 className="h-4 w-4" />}
        >
          Visualizer &amp; Trade
        </TabButton>
        <TabButton
          active={activeTab === "logic"}
          onClick={() => setActiveTab("logic")}
          icon={<GitBranch className="h-4 w-4" />}
        >
          Settlement &amp; Composition Logic
        </TabButton>
        <TabButton
          active={activeTab === "oracle"}
          onClick={() => setActiveTab("oracle")}
          icon={<Cpu className="h-4 w-4" />}
        >
          Oracle Architecture Guide
        </TabButton>
        <TabButton
          active={activeTab === "faq"}
          onClick={() => setActiveTab("faq")}
          icon={<HelpCircle className="h-4 w-4" />}
        >
          Rules &amp; Conflict FAQs
        </TabButton>
      </div>

      {/* Main Content Areas */}
      <div className="mt-8">
        {activeTab === "visualizer" && (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-8 min-w-0">
              <MarketVisualizer market={market} />
            </div>

            <aside className="lg:sticky lg:top-24 h-fit">
              <MarketPositionCard market={market} />
            </aside>
          </div>
        )}

        {activeTab === "logic" && (
          <div className="flex flex-col gap-8">
            <section className="border border-gray-300 bg-paper p-6 rounded-sm">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-600" /> What this market settles on
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {market.event.kind === "composite"
                  ? "A composite Novak event — its identity is canonical, so any other protocol composing the same facts reads the same answer."
                  : "A primitive Novak event, resolved by an independent resolver quorum."}{" "}
                Trading closed/closes at {fmtTime(market.tradingClosesAt)}, when observation opens.
              </p>
              <div className="mt-4 overflow-x-auto border border-gray-300 bg-gray-50/50 p-5 rounded-sm">
                <CompositionTree node={toTree(market.event)} />
              </div>
            </section>

            <section>
              <SettlementSimulator yesPool={pool(market.yesPool)} noPool={pool(market.noPool)} />
            </section>

            <section className="border border-gray-300 bg-paper p-6 rounded-sm">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-600" /> Contract Settlement Invariants
              </h2>
              <div className="mt-3 text-sm text-gray-700 leading-relaxed space-y-3 font-sans">
                <p>
                  Resolvers read the source (Chainlink feeds, stock-token ERC-8056 logs, Robinhood&apos;s asset registry) and submit the outcome plus an evidence hash. Once the quorum agrees and the dispute window passes, the event is final, and <code>Market.settle()</code> reads it through <code>Settlement → EventBus</code> — never from a resolver directly.
                </p>
                <p>
                  <strong>Parimutuel Payouts:</strong> Winners split the losing pool pro-rata to stake (minus a {feeBps !== undefined ? Number(feeBps) / 100 : "1"}% protocol fee) and get their own stake back. If nobody backed the winning side, everyone is refunded and no fee is taken.
                </p>
                <p>
                  <strong>Non-Convergence Guarantee:</strong> If the event is <strong>Voided</strong> (a dispute that never converged, or nobody could observe it), the market switches to refunds: everyone reclaims 100% of their deposited collateral.
                </p>
              </div>
            </section>
          </div>
        )}

        {activeTab === "oracle" && (
          <div className="flex flex-col gap-8">
            <OracleArchitectureGuide />
          </div>
        )}

        {activeTab === "faq" && (
          <div className="flex flex-col gap-8">
            <DistributionMarketFAQ />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-medium rounded-sm transition-colors cursor-pointer",
        active ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
