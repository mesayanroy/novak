"use client";

import { useState } from "react";
import Link from "next/link";
import { Availability, MarketStatus } from "@novak/sdk";
import { MarketCard } from "@/components/markets/MarketCard";
import { CreateMarketCard } from "@/components/CreateMarketCard";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import { NOVAK_CHAIN_ID, deployment } from "@/lib/addresses";
import { fmtTime, fmtUsdg, useEvents, useMarkets, type EventNode } from "@/lib/novak";
import { shortHex } from "@/lib/utils";
import { BarChart3, PlusCircle, Radio, ShieldAlert, TrendingUp } from "lucide-react";

type Tab = "markets" | "events" | "create";

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("markets");
  const markets = useMarkets();
  const events = useEvents();

  if (!deployment) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-ink">Markets</h1>
        <p className="mt-4 text-gray-600">
          No Novak deployment is configured for chain {NOVAK_CHAIN_ID}. Deploy with <code>script/Deploy.s.sol</code>, run{" "}
          <code>node script/export-deployment.mjs {NOVAK_CHAIN_ID}</code> and <code>pnpm --filter @novak/sdk gen</code>, then
          reload. See the <Link href="/docs">docs</Link>.
        </p>
      </div>
    );
  }

  const list = markets.data ?? [];
  const pooled = list.reduce((s, m) => s + m.yesPool + m.noPool, 0n);
  const open = list.filter((m) => m.status === MarketStatus.Open).length;
  const evs = events.data ?? [];
  const decided = evs.filter((e) => e.availability !== Availability.Pending).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live · Robinhood Chain {NOVAK_CHAIN_ID === 46630 ? "testnet" : `(chain ${NOVAK_CHAIN_ID})`}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl text-ink">Event markets on tokenized stocks</h1>
        <p className="mt-2 text-gray-600 max-w-2xl text-sm leading-relaxed">
          Every market settles against a Novak event — a fact about a Robinhood Stock Token, resolved once by independent
          resolvers from live Robinhood Chain data, disputable, and readable by any contract through{" "}
          <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded">EventBus</code>.
          Collateral is test USDG.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="USDG pooled" value={fmtUsdg(pooled)} />
        <Stat icon={<BarChart3 className="h-3.5 w-3.5" />} label="Markets" value={`${list.length}`} note={`${open} open`} />
        <Stat icon={<Radio className="h-3.5 w-3.5" />} label="Events" value={`${evs.length}`} note={`${decided} decided`} />
        <Stat icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Disputes" value="Tier 1 → 2" note="bonded committees, never token votes" />
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <TabButton active={tab === "markets"} onClick={() => setTab("markets")} icon={<BarChart3 className="h-4 w-4" />}>
          Markets
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")} icon={<Radio className="h-4 w-4" />}>
          Event feed
        </TabButton>
        <TabButton active={tab === "create"} onClick={() => setTab("create")} icon={<PlusCircle className="h-4 w-4" />}>
          Create market
        </TabButton>
      </div>

      {tab === "markets" && (
        <div className="mt-6">
          {markets.isLoading ? (
            <p className="text-sm text-gray-500">Loading markets from chain…</p>
          ) : markets.error ? (
            <p className="text-sm text-rose-700">Couldn&apos;t read markets: {(markets.error as Error).message}</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-600">
              No markets yet.{" "}
              <button className="underline" onClick={() => setTab("create")}>
                Create the first one
              </button>
              .
            </p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {list.map((m) => (
                <MarketCard key={m.marketId} market={m} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "events" && (
        <div className="mt-6 flex flex-col gap-3">
          {events.isLoading && <p className="text-sm text-gray-500">Scanning EventCreated logs…</p>}
          {evs.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </div>
      )}

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
    <div className="border border-gray-300 bg-paper p-4 rounded-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{shortHex(e.id, 8, 6)}</span>
        {e.kind === "composite" ? (
          <CompositeStatusPill status={e.compositeStatus ?? "Unresolved"} />
        ) : (
          e.status !== undefined && <EventStatusPill status={e.status} />
        )}
      </div>
      <h4 className="mt-2 font-medium text-ink">{e.title}</h4>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-gray-600">
        {e.source && <span>Source: {e.source}</span>}
        {e.opensAt !== undefined && <span>Observation opens {fmtTime(e.opensAt)}</span>}
        {e.spec && <span>Quorum {e.spec.quorumThreshold} · spec v{e.spec.specVersion}</span>}
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
      className={`link-plain flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
        active ? "bg-ink text-paper" : "text-gray-600 hover:text-ink hover:bg-gray-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
