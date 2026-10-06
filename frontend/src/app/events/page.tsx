"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Availability, EventStatus } from "@novakoracle/sdk";
import { ArrowRight, Radio, Search } from "lucide-react";
import { useEvents, tickersOf, type EventNode } from "@/lib/novak";
import { deployment } from "@/lib/addresses";
import { EventStatusPill } from "@/components/StatusPill";
import { AssetStack } from "@/components/markets/AssetIcon";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { cn } from "@/lib/utils";

type Filter = "all" | "live" | "challenge" | "committee" | "final" | "void";
const FILTERS: [Filter, string, (e: EventNode) => boolean][] = [
  ["all", "All", () => true],
  ["live", "Being observed", (e) => e.status === EventStatus.Open || e.status === EventStatus.ObservationsSubmitted],
  ["challenge", "Open to challenge", (e) => e.status === EventStatus.ProposedOutcome],
  ["committee", "In committee", (e) => e.status === EventStatus.Disputed],
  ["final", "Finalized", (e) => e.availability === Availability.Available],
  ["void", "Voided / expired", (e) => e.availability === Availability.Voided],
];

export default function EventsPage() {
  const { data, isLoading } = useEvents();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");

  const events = useMemo(() => data ?? [], [data]);
  const sources = useMemo(() => ["all", ...new Set(events.map((e) => e.source ?? "composite"))], [events]);
  const pred = FILTERS.find((f) => f[0] === filter)![2];
  const shown = events.filter(
    (e) => pred(e) && (source === "all" || (e.source ?? "composite") === source) && (!q || `${e.title} ${e.id}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_80%_at_80%_30%,white,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
            <Radio className="h-4 w-4" /> Event explorer
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">Every fact, and how it was decided.</h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-700">
            Each Novak event with its full on-chain history: who observed what, the evidence behind it, any dispute, and every
            market that settles on it.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {FILTERS.map(([key, label, p]) => {
            const n = events.filter(p).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  filter === key ? "border-violet-600 bg-violet-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-violet-300",
                )}
              >
                {label} <span className={cn("ml-1 font-mono text-[11px]", filter === key ? "text-violet-100" : "text-gray-400")}>{n}</span>
              </button>
            );
          })}
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 max-w-[13rem] truncate rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-700">
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All sources" : s}
                </option>
              ))}
            </select>
            <label className="flex h-10 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 sm:w-56 sm:flex-none">
              <Search className="h-4 w-4 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NVDA, 0x…" className="w-full bg-transparent text-sm outline-none" />
            </label>
          </div>
        </div>

        {!deployment ? (
          <p className="mt-10 text-gray-600">No deployment configured for this chain.</p>
        ) : isLoading ? (
          <div className="mt-6 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-violet-50" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-10 text-gray-500">No events match.</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {shown.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="link-plain group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_10px_30px_-20px_rgba(109,74,255,0.6)]"
                >
                  <AssetStack tickers={tickersOf(e)} category={e.category} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink group-hover:text-violet-700">{e.title}</span>
                    <span className="block truncate font-mono text-[10px] text-gray-400">
                      {e.kind === "composite" ? "composite" : e.source} · {e.id.slice(0, 14)}…
                    </span>
                  </span>
                  {e.kind === "primitive" && e.status !== undefined ? (
                    <EventStatusPill status={e.status} />
                  ) : (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[10px] text-violet-700">{e.compositeStatus}</span>
                  )}
                  <ArrowRight className="h-4 w-4 flex-none text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
