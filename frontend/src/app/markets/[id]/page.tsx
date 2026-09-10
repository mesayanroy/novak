import { notFound } from "next/navigation";
import { EventStatus } from "@novak/sdk";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { CompositeStatusPill } from "@/components/StatusPill";
import { CompositionTree, type CompositionNode } from "@/components/markets/CompositionTree";
import { MarketPositionCard } from "@/components/MarketPositionCard";
import { SettlementSimulator } from "@/components/markets/SettlementSimulator";
import { findMockMarket, findMockPrimitiveEvent, mockCompositeEvent } from "@/lib/mock-data";
import { shortHex } from "@/lib/utils";
import { Layers, ShieldCheck, GitBranch, Terminal } from "lucide-react";

export function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Market ${shortHex(params.id)} — Novak` };
}

export default function MarketDetailPage({ params }: { params: { id: string } }) {
  const market = findMockMarket(params.id);
  if (!market) notFound();

  const isCompositeMarket = market.compositeId === mockCompositeEvent.id;
  const compositeStatus = market.settled ? (market.outcome ? "True" : "False") : mockCompositeEvent.status;

  const tree: CompositionNode = isCompositeMarket
    ? {
        id: mockCompositeEvent.id,
        title: "WITHIN(48h) composite",
        kind: "composite",
        op: "Within",
        windowSeconds: mockCompositeEvent.windowSeconds,
        compositeStatus,
        children: mockCompositeEvent.operandIds.map((id) => {
          const p = findMockPrimitiveEvent(id);
          return {
            id,
            title: p?.title ?? id,
            kind: "primitive",
            eventStatus: p?.status ?? EventStatus.Finalized,
          };
        }),
      }
    : {
        id: market.compositeId,
        title: findMockPrimitiveEvent(market.compositeId)?.title ?? "Underlying event",
        kind: "primitive",
        eventStatus: findMockPrimitiveEvent(market.compositeId)?.status ?? EventStatus.Disputed,
      };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">
            <span className="h-2 w-2 rounded-full bg-ink animate-pulse-subtle" />
            Market Specification #{shortHex(market.id, 6, 4)}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-ink max-w-3xl">
            {market.question}
          </h1>
          <div className="mt-3 flex items-center gap-3 font-mono text-xs text-gray-500 flex-wrap">
            <span>Market ID: <strong className="text-ink">{shortHex(market.id, 10, 8)}</strong></span>
            <span>•</span>
            <span>Underlying Hash: <strong className="text-ink">{shortHex(market.compositeId, 10, 8)}</strong></span>
          </div>
        </div>
        <ExampleDataBadge />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-10">
          {/* Interactive Settlement Simulator */}
          <section>
            <SettlementSimulator
              yesPool={Number(market.yesPoolEth)}
              noPool={Number(market.noPoolEth)}
            />
          </section>

          {/* Composition Tree */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-ink" />
                  Composition Tree Architecture
                </h2>
                <p className="text-sm text-gray-600">
                  What this derivative market settles against, and via which deterministic operator.
                </p>
              </div>
            </div>
            <div className="mt-4 border border-gray-300 bg-paper p-5 rounded-sm">
              <CompositionTree node={tree} />
            </div>
          </section>

          {/* How This Settles */}
          <section>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Terminal className="h-4 w-4 text-ink" />
              Settlement Protocol Specification
            </h2>
            <div className="mt-3 border border-gray-300 bg-paper p-5 text-sm text-gray-700 leading-relaxed rounded-sm space-y-3">
              <p>
                Once the underlying event above reaches a terminal <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1 py-0.5 rounded text-ink font-semibold">Finalized</code> state on <code className="font-mono text-xs font-semibold">EventBus</code>,
                anyone can invoke <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1 py-0.5 rounded text-ink font-semibold">Market.settle()</code>, which reads
                the outcome directly through <code className="font-mono text-xs font-semibold">Settlement → EventBus</code> —
                never querying a resolver or the Registry directly.
              </p>
              <p>
                This is a parimutuel pool: everyone backing the winning side splits the losing side&apos;s
                pool pro-rata to their stake, plus gets their own stake back. If nobody backed the
                winning side, everyone is refunded their own stake — payouts can never exceed deposits.
              </p>
              <p className="text-gray-500 text-xs">
                If the underlying event is instead marked <code className="font-mono text-xs">Voided</code>, this
                market has no settleable outcome and remains open indefinitely.
              </p>
            </div>
          </section>
        </div>

        <aside className="sticky top-24 h-fit">
          <MarketPositionCard marketId={market.id} />
        </aside>
      </div>
    </div>
  );
}
