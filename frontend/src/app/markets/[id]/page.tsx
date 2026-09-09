import { notFound } from "next/navigation";
import { EventStatus } from "@novak/sdk";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { CompositeStatusPill } from "@/components/StatusPill";
import { CompositionTree, type CompositionNode } from "@/components/markets/CompositionTree";
import { MarketPositionCard } from "@/components/MarketPositionCard";
import { findMockMarket, findMockPrimitiveEvent, mockCompositeEvent } from "@/lib/mock-data";
import { shortHex } from "@/lib/utils";

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
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{market.question}</h1>
          <p className="mt-2 font-mono text-xs text-gray-500">Market ID {shortHex(market.id, 10, 8)}</p>
        </div>
        <ExampleDataBadge />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="text-lg font-semibold">Composition tree</h2>
            <p className="mt-1 text-sm text-gray-600">
              What this market settles against, and via which operator.
            </p>
            <div className="mt-4 border border-gray-300 p-4">
              <CompositionTree node={tree} />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">How this settles</h2>
            <div className="mt-3 border border-gray-300 p-5 text-sm text-gray-700">
              <p>
                Once the underlying event above reaches a terminal <code className="font-mono text-xs">Finalized</code> state,
                anyone can call <code className="font-mono text-xs">Market.settle()</code>, which reads
                the outcome through <code className="font-mono text-xs">Settlement → EventBus</code> —
                never a resolver or the Registry directly.
              </p>
              <p className="mt-3">
                This is a parimutuel pool: everyone backing the winning side splits the losing side&apos;s
                pool pro-rata to their stake, plus gets their own stake back. If nobody backed the
                winning side, everyone is refunded their own stake — payouts can never exceed deposits.
              </p>
              <p className="mt-3 text-gray-500">
                If the underlying event is instead marked <code className="font-mono text-xs">Voided</code>, this
                market has no settleable outcome and remains open indefinitely — there is no separate
                cancellation/refund path yet (a known, tracked gap).
              </p>
            </div>
          </section>
        </div>

        <aside>
          <MarketPositionCard marketId={market.id} />
        </aside>
      </div>
    </div>
  );
}
