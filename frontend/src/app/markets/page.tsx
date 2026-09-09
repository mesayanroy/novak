import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { MarketCard, type MarketUnderlying } from "@/components/markets/MarketCard";
import { CreateMarketCard } from "@/components/CreateMarketCard";
import { mockCompositeEvent, mockMarkets, findMockPrimitiveEvent } from "@/lib/mock-data";

export const metadata = { title: "Markets — Novak" };

function underlyingFor(compositeId: string): MarketUnderlying {
  const primitive = findMockPrimitiveEvent(compositeId);
  if (primitive) {
    return { kind: "primitive", status: primitive.status, tier: primitive.disputeTier };
  }
  return { kind: "composite", status: mockCompositeEvent.status };
}

export default function MarketsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Markets</h1>
          <p className="mt-2 text-gray-600">
            Derivatives markets settle against a finalized (possibly composite) event via{" "}
            <code className="font-mono text-sm">Settlement → EventBus</code>.
          </p>
        </div>
        <ExampleDataBadge />
      </div>

      {/* TODO: wire to an indexer/subgraph once one exists — Market.sol has
         no on-chain enumeration of market IDs, only a keyed markets(id)
         lookup, so this list can't be built from the contract alone. */}
      <p className="mt-4 max-w-2xl text-sm text-gray-500">
        This list is example data. There is currently no on-chain way to enumerate every market — see{" "}
        <span className="font-mono text-xs">Market.sol</span>, which only supports a keyed lookup by ID.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {mockMarkets.map((market) => (
          <MarketCard key={market.id} market={market} underlying={underlyingFor(market.compositeId)} />
        ))}
      </div>

      <div className="mt-12 border-t border-gray-200 pt-8">
        <CreateMarketCard />
      </div>
    </div>
  );
}
