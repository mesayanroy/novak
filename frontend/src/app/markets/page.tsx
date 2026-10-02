"use client";

import { useState } from "react";
import Link from "next/link";
import { Availability, MarketStatus } from "@novak/sdk";
import { MarketCard } from "@/components/markets/MarketCard";
import { CreateMarketCard } from "@/components/CreateMarketCard";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import { OracleArchitectureGuide } from "@/components/markets/OracleArchitectureGuide";
import { DistributionMarketFAQ } from "@/components/markets/DistributionMarketFAQ";
import { NOVAK_CHAIN_ID, deployment } from "@/lib/addresses";
import { fmtTime, fmtUsdg, useEvents, useMarkets, type EventNode, type LiveMarket } from "@/lib/novak";
import { shortHex, cn } from "@/lib/utils";
import {
  BarChart3,
  PlusCircle,
  Radio,
  ShieldAlert,
  TrendingUp,
  Search,
  Filter,
  Cpu,
  HelpCircle,
  Sparkles,
} from "lucide-react";

type MainTab = "markets" | "events" | "oracle" | "faq" | "create";
type MarketCategory = "all font-bold" | "all" | "corporate" | "trading" | "price" | "composite";

export default function MarketsPage() {
  const [tab, setTab] = useState<MainTab>("markets");
  const [category, setCategory] = useState<MarketCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const markets = useMarkets();
  const events = useEvents();


  const list = markets.data ?? [];
  const pooled = list.reduce((s, m) => s + m.yesPool + m.noPool, 0n);
  const open = list.filter((m) => m.status === MarketStatus.Open).length;
  const evs = events.data ?? [];
  const decided = evs.filter((e) => e.availability !== Availability.Pending).length;

  // Filtering Markets by category & search
  const filteredList = list.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      q === "" ||
      (m.question && m.question.toLowerCase().includes(q)) ||
      m.event.title.toLowerCase().includes(q) ||
      m.marketId.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (category === "all") return true;
    if (category === "composite") return m.event.kind === "composite";
    if (category === "corporate") return m.event.source?.toLowerCase().includes("erc-8056") || m.event.title.toLowerCase().includes("split");
    if (category === "trading") return m.event.source?.toLowerCase().includes("trading") || m.event.title.toLowerCase().includes("tradable");
    if (category === "price") return m.event.source?.toLowerCase().includes("chainlink") || m.event.title.toLowerCase().includes("$");
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Top Banner */}
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · Robinhood Chain {NOVAK_CHAIN_ID === 46630 ? "testnet" : `(chain ${NOVAK_CHAIN_ID})`}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl text-ink">
          Event Markets on Tokenized Stocks
        </h1>
        <p className="mt-2 text-gray-600 max-w-3xl text-sm leading-relaxed">
          Every market settles against a Novak event — real-world facts about Robinhood Stock Tokens (corporate actions, trading status, price conditions), resolved once by independent resolvers, disputable via bonded committees, and readable by any contract through{" "}
          <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded">EventBus</code>.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="USDG pooled" value={fmtUsdg(pooled)} />
        <Stat icon={<BarChart3 className="h-3.5 w-3.5" />} label="Markets" value={`${list.length}`} note={`${open} open`} />
        <Stat icon={<Radio className="h-3.5 w-3.5" />} label="Events" value={`${evs.length}`} note={`${decided} decided`} />
        <Stat icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Disputes" value="Tier 1 → 2" note="bonded committees, never token votes" />
      </div>

      {/* Main Tabs */}
      <div className="mt-10 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <TabButton active={tab === "markets"} onClick={() => setTab("markets")} icon={<BarChart3 className="h-4 w-4" />}>
          Markets Explorer ({list.length})
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")} icon={<Radio className="h-4 w-4" />}>
          Event Feed ({evs.length})
        </TabButton>
        <TabButton active={tab === "oracle"} onClick={() => setTab("oracle")} icon={<Cpu className="h-4 w-4" />}>
          Oracle Architecture
        </TabButton>
        <TabButton active={tab === "faq"} onClick={() => setTab("faq")} icon={<HelpCircle className="h-4 w-4" />}>
          Rules &amp; FAQs
        </TabButton>
        <TabButton active={tab === "create"} onClick={() => setTab("create")} icon={<PlusCircle className="h-4 w-4" />}>
          Create Market
        </TabButton>
      </div>

      {/* Tab: Markets Explorer */}
      {tab === "markets" && (
        <div className="mt-6">
          {/* Sub-Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-gray-50/80 p-3 border border-gray-200 rounded-sm">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="font-mono text-xs text-gray-500 font-semibold mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Filter:
              </span>
              <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </CategoryChip>
              <CategoryChip active={category === "corporate"} onClick={() => setCategory("corporate")}>
                Corporate Actions
              </CategoryChip>
              <CategoryChip active={category === "trading"} onClick={() => setCategory("trading")}>
                Trading Status
              </CategoryChip>
              <CategoryChip active={category === "price"} onClick={() => setCategory("price")}>
                Price-at-Time
              </CategoryChip>
              <CategoryChip active={category === "composite"} onClick={() => setCategory("composite")}>
                Composite Events
              </CategoryChip>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets or tickers..."
                className="w-full pl-8 pr-3 py-1 border border-gray-300 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ink bg-paper"
              />
            </div>
          </div>

          {markets.isLoading ? (
            <p className="text-sm font-mono text-gray-500 py-8 text-center animate-pulse">Loading markets from chain…</p>
          ) : markets.error ? (
            <p className="text-sm font-mono text-rose-700 py-4">Couldn&apos;t read markets: {(markets.error as Error).message}</p>
          ) : filteredList.length === 0 ? (
            <div className="border border-gray-300 bg-paper p-8 text-center rounded-sm">
              <p className="text-sm text-gray-600 font-mono">
                No markets found matching criteria.{" "}
                <button className="underline font-semibold text-ink" onClick={() => setTab("create")}>
                  Create a new market
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {filteredList.map((m) => (
                <MarketCard key={m.marketId} market={m} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Event Feed */}
      {tab === "events" && (
        <div className="mt-6 flex flex-col gap-3">
          {events.isLoading && <p className="text-sm font-mono text-gray-500 py-4">Scanning EventCreated logs from chain…</p>}
          {evs.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </div>
      )}

      {/* Tab: Oracle Architecture */}
      {tab === "oracle" && (
        <div className="mt-6">
          <OracleArchitectureGuide />
        </div>
      )}

      {/* Tab: FAQ & Rules */}
      {tab === "faq" && (
        <div className="mt-6">
          <DistributionMarketFAQ />
        </div>
      )}

      {/* Tab: Create Market */}
      {tab === "create" && (
        <div className="mt-6">
          <CreateMarketCard onCreated={() => setTab("markets")} />
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: EventNode }) {
  return (
    <div className="border border-gray-300 bg-paper p-4 rounded-sm hover:border-ink transition-colors shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{shortHex(e.id, 8, 6)}</span>
        {e.kind === "composite" ? (
          <CompositeStatusPill status={e.compositeStatus ?? "Unresolved"} />
        ) : (
          e.status !== undefined && <EventStatusPill status={e.status} />
        )}
      </div>
      <h4 className="mt-2 font-medium text-ink text-base">{e.title}</h4>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-gray-600 border-t border-gray-100 pt-2">
        {e.source && <span>Source: {e.source}</span>}
        {e.opensAt !== undefined && <span>Observation opens {fmtTime(e.opensAt)}</span>}
        {e.spec && <span>Quorum threshold {e.spec.quorumThreshold} · spec v{e.spec.specVersion}</span>}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="border border-gray-300 bg-paper p-4 rounded-sm shadow-sm">
      <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
        <span>{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold font-mono text-ink">{value}</p>
      {note && <p className="mt-1 text-[11px] text-gray-500 font-mono">{note}</p>}
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
      className={`link-plain flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-sm transition-colors cursor-pointer ${
        active ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer",
        active
          ? "bg-emerald-700 text-paper font-semibold"
          : "bg-paper border border-gray-300 text-gray-700 hover:bg-gray-100"
      )}
    >
      {children}
    </button>
  );
}
