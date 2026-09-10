"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { MarketCard, type MarketUnderlying } from "@/components/markets/MarketCard";
import { CreateMarketCard } from "@/components/CreateMarketCard";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import { mockCompositeEvent, mockMarkets, mockPrimitiveEvents, findMockPrimitiveEvent } from "@/lib/mock-data";
import { shortHex } from "@/lib/utils";
import {
  BarChart3,
  LayoutGrid,
  Table as TableIcon,
  Radio,
  PlusCircle,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Layers,
} from "lucide-react";

function underlyingFor(compositeId: string): MarketUnderlying {
  const primitive = findMockPrimitiveEvent(compositeId);
  if (primitive) {
    return { kind: "primitive", status: primitive.status, tier: primitive.disputeTier };
  }
  return { kind: "composite", status: mockCompositeEvent.status };
}

export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState<"markets" | "events" | "create">("markets");
  const [filter, setFilter] = useState<"all" | "primitive" | "composite">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Calculate total pooled ETH
  const totalEthPooled = mockMarkets
    .reduce((acc, m) => acc + Number(m.yesPoolEth) + Number(m.noPoolEth), 0)
    .toFixed(2);

  const filteredMarkets = mockMarkets.filter((market) => {
    const underlying = underlyingFor(market.compositeId);
    if (filter === "primitive") return underlying.kind === "primitive";
    if (filter === "composite") return underlying.kind === "composite";
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header & Title */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
            <span className="h-2 w-2 rounded-full bg-ink animate-pulse-subtle" />
            Derivative Market Hub
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl text-ink">
            Prediction &amp; Derivative Markets
          </h1>
          <p className="mt-2 text-gray-600 max-w-2xl">
            Derivatives markets settle trustlessly against finalized composite events via{" "}
            <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-ink">
              Settlement → EventBus
            </code>.
          </p>
        </div>
        <ExampleDataBadge />
      </div>

      {/* Protocol Statistics Bar */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="border border-gray-300 bg-paper p-4 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>Total Pooled</span>
            <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono text-ink">{totalEthPooled} ETH</p>
          <p className="mt-1 text-[11px] text-gray-500">Parimutuel Collateral</p>
        </div>

        <div className="border border-gray-300 bg-paper p-4 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>Active Markets</span>
            <BarChart3 className="h-3.5 w-3.5 text-gray-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono text-ink">{mockMarkets.length}</p>
          <p className="mt-1 text-[11px] text-gray-500">1 Primitive, 1 Composite</p>
        </div>

        <div className="border border-gray-300 bg-paper p-4 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>Event Bus Feeds</span>
            <Radio className="h-3.5 w-3.5 text-gray-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono text-ink">
            {mockPrimitiveEvents.length + 1} Feeds
          </p>
          <p className="mt-1 text-[11px] text-gray-500">Finalized &amp; Observed</p>
        </div>

        <div className="border border-gray-300 bg-paper p-4 rounded-sm">
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>Dispute Guard</span>
            <ShieldAlert className="h-3.5 w-3.5 text-gray-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono text-ink">Tier 1 &amp; 2</p>
          <p className="mt-1 text-[11px] text-gray-500">Bonded Challenge Ladder</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("markets")}
            className={`link-plain flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
              activeTab === "markets" ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Explore Markets
          </button>

          <button
            onClick={() => setActiveTab("events")}
            className={`link-plain flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
              activeTab === "events" ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
            }`}
          >
            <Radio className="h-4 w-4" />
            Event Feed Monitor
          </button>

          <button
            onClick={() => setActiveTab("create")}
            className={`link-plain flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
              activeTab === "create" ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            Create Market
          </button>
        </div>

        {activeTab === "markets" && (
          <div className="flex items-center gap-3">
            {/* Category Filter Pills */}
            <div className="flex items-center border border-gray-300 rounded p-0.5 text-xs font-mono">
              <button
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 rounded-sm transition-colors ${
                  filter === "all" ? "bg-ink text-paper font-semibold" : "text-gray-600 hover:text-ink"
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setFilter("primitive")}
                className={`px-2.5 py-1 rounded-sm transition-colors ${
                  filter === "primitive" ? "bg-ink text-paper font-semibold" : "text-gray-600 hover:text-ink"
                }`}
              >
                PRIMITIVE
              </button>
              <button
                onClick={() => setFilter("composite")}
                className={`px-2.5 py-1 rounded-sm transition-colors ${
                  filter === "composite" ? "bg-ink text-paper font-semibold" : "text-gray-600 hover:text-ink"
                }`}
              >
                COMPOSITE
              </button>
            </div>

            {/* Grid vs Table View Switcher */}
            <div className="flex items-center border border-gray-300 rounded p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={`p-1.5 rounded-sm transition-colors ${
                  viewMode === "grid" ? "bg-ink text-paper" : "text-gray-500 hover:text-ink"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                title="Table view"
                className={`p-1.5 rounded-sm transition-colors ${
                  viewMode === "table" ? "bg-ink text-paper" : "text-gray-500 hover:text-ink"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content: Markets */}
      {activeTab === "markets" && (
        <div className="mt-6">
          <p className="mb-4 text-xs font-mono text-gray-500">
            Showing {filteredMarkets.length} market{filteredMarkets.length !== 1 ? "s" : ""} settled against EventBus finalized state.
          </p>

          {viewMode === "grid" ? (
            <div className="grid gap-5 md:grid-cols-2">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  underlying={underlyingFor(market.compositeId)}
                />
              ))}
            </div>
          ) : (
            /* Technical Matrix Table View */
            <div className="overflow-x-auto border border-gray-300 rounded-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 font-mono text-gray-600 uppercase tracking-wider border-b border-gray-300">
                  <tr>
                    <th className="p-3 font-semibold">Market ID</th>
                    <th className="p-3 font-semibold">Question</th>
                    <th className="p-3 font-semibold">Underlying Feed</th>
                    <th className="p-3 font-semibold">YES Pool</th>
                    <th className="p-3 font-semibold">NO Pool</th>
                    <th className="p-3 font-semibold">Total Collateral</th>
                    <th className="p-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono bg-paper">
                  {filteredMarkets.map((market) => {
                    const total = Number(market.yesPoolEth) + Number(market.noPoolEth);
                    return (
                      <tr key={market.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-bold text-ink">{shortHex(market.id, 6, 4)}</td>
                        <td className="p-3 font-sans font-medium text-ink max-w-xs truncate">
                          {market.question}
                        </td>
                        <td className="p-3 text-gray-600">{shortHex(market.compositeId, 6, 4)}</td>
                        <td className="p-3 text-ink font-semibold">{market.yesPoolEth} ETH</td>
                        <td className="p-3 text-ink font-semibold">{market.noPoolEth} ETH</td>
                        <td className="p-3 text-ink font-bold">{total.toFixed(2)} ETH</td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/markets/${market.id}`}
                            className="link-plain inline-flex items-center gap-1 border border-ink bg-ink text-paper px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide hover:bg-gray-800 rounded-sm"
                          >
                            Trade <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Event Stream Monitor */}
      {activeTab === "events" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex flex-col gap-6"
        >
          <div className="border border-gray-300 bg-paper p-5 rounded-sm">
            <h3 className="font-semibold text-lg text-ink flex items-center gap-2">
              <Radio className="h-4 w-4 text-ink" />
              EventBus Feed Monitor &amp; Registry Stream
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Inspect on-chain primitive events observed by authorized resolvers and composite logic nodes evaluated by <code className="font-mono text-xs">EventComposer.sol</code>.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              {/* Composite Event Card */}
              <div className="border border-gray-300 bg-gray-50 p-4 rounded-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold border border-ink bg-ink text-paper px-1.5 py-0.5 rounded-sm">
                      C-EVENT
                    </span>
                    <span className="font-mono text-xs text-gray-600">{shortHex(mockCompositeEvent.id, 8, 6)}</span>
                  </div>
                  <CompositeStatusPill status={mockCompositeEvent.status} />
                </div>
                <h4 className="mt-2 font-medium text-base text-ink">
                  WITHIN(48h) Composite: BTC &gt; $100k AND Fed Rate Cut within 48h
                </h4>
                <div className="mt-3 flex items-center gap-4 text-xs font-mono text-gray-600 flex-wrap">
                  <span>Operator: <strong className="text-ink">WITHIN</strong></span>
                  <span>Window: <strong className="text-ink">172,800s (48h)</strong></span>
                  <span>Operands: <strong className="text-ink">2 Primitive Events</strong></span>
                </div>
              </div>

              {/* Primitive Events */}
              {mockPrimitiveEvents.map((pevent) => (
                <div key={pevent.id} className="border border-gray-300 bg-paper p-4 rounded-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold border border-gray-300 px-1.5 py-0.5 rounded-sm text-gray-700">
                        PRIMITIVE
                      </span>
                      <span className="font-mono text-xs text-gray-600">{shortHex(pevent.id, 8, 6)}</span>
                    </div>
                    <EventStatusPill status={pevent.status} tier={pevent.disputeTier} />
                  </div>
                  <h4 className="mt-2 font-medium text-base text-ink">{pevent.title}</h4>
                  <div className="mt-3 flex items-center gap-4 text-xs font-mono text-gray-600 flex-wrap">
                    <span>Resolver: <strong className="text-ink">Fed Watcher Adapter</strong></span>
                    <span>Observation Time: <strong className="text-ink">2026-09-10T14:00:00Z</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tab Content: Create Market */}
      {activeTab === "create" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <CreateMarketCard />
        </motion.div>
      )}
    </div>
  );
}
