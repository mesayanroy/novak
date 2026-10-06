"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import { Availability, explorerUrl, type Hex } from "@novakoracle/sdk";
import { ArrowLeft, Check, Copy, GitBranch, Layers, ShieldCheck, Store } from "lucide-react";
import { deployment, NOVAK_CHAIN_ID } from "@/lib/addresses";
import { loadEventNode, OP_LABEL, tickersOf, useMarkets, type EventNode } from "@/lib/novak";
import { useDistributionMarkets } from "@/lib/distribution";
import { specRows, useEventTimeline, useGuardRules, usedBy } from "@/lib/explorer";
import { Timeline } from "@/components/explorer/Timeline";
import { DisputePanel } from "@/components/disputes/DisputePanel";
import { ReusePanel } from "@/components/explorer/ReusePanel";
import { EventStatusPill } from "@/components/StatusPill";
import { AssetBadge } from "@/components/markets/AssetIcon";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { fmtTime } from "@/lib/novak";

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(109,74,255,0.5)]">
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CopyId({ id }: { id: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 font-mono text-[11px] text-gray-600 hover:border-violet-300"
    >
      {ok ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      <span className="truncate">{id}</span>
    </button>
  );
}

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id as Hex;
  const pc = usePublicClient();
  const explorer = explorerUrl(NOVAK_CHAIN_ID);

  const { data: node, isLoading, error } = useQuery({
    queryKey: ["novak", "eventNode", eventId],
    enabled: Boolean(pc && deployment && /^0x[0-9a-fA-F]{64}$/.test(eventId)),
    refetchInterval: 10_000,
    queryFn: () => loadEventNode(pc as PublicClient, eventId),
  });
  const { data: timeline, isLoading: tlLoading } = useEventTimeline(eventId);
  const { data: markets } = useMarkets();
  const { data: dists } = useDistributionMarkets();
  const { data: rules } = useGuardRules(eventId);
  const users = usedBy(eventId, markets, dists);

  if (!deployment) return <p className="mx-auto max-w-5xl px-6 py-16 text-gray-600">No deployment configured for this chain.</p>;
  if (isLoading) return <div className="mx-auto mt-16 h-40 max-w-5xl animate-pulse rounded-3xl bg-violet-50" />;
  if (error || !node)
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-gray-700">Couldn&apos;t load event {eventId}.</p>
        <Link href="/events" className="mt-3 inline-block text-violet-700 underline">
          ← All events
        </Link>
      </div>
    );

  const tickers = tickersOf(node);
  const usage = users.markets.length + users.ranges.length + (rules?.length ?? 0);

  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_80%_at_80%_30%,white,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-10">
          <Link href="/events" className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-violet-700">
            <ArrowLeft className="h-3.5 w-3.5" /> All events
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {node.kind === "primitive" && node.status !== undefined ? (
              <EventStatusPill status={node.status} />
            ) : (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-mono text-[11px] text-violet-700">
                composite · {node.op !== undefined ? OP_LABEL[node.op] : ""} · {node.compositeStatus}
              </span>
            )}
            {tickers.length > 0 && <AssetBadge tickers={tickers} category={node.category} />}
            <span className="font-mono text-[11px] text-gray-500">{node.source ?? "composite event"}</span>
          </div>
          <h1 className="mt-3 max-w-4xl text-2xl font-semibold tracking-tight text-ink sm:text-4xl">{node.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CopyId id={eventId} />
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] ${
                node.availability === Availability.Available
                  ? "bg-emerald-50 text-emerald-700"
                  : node.availability === Availability.Voided
                    ? "bg-rose-50 text-rose-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              EventBus: {node.availability === Availability.Available ? "Available" : node.availability === Availability.Voided ? "Voided" : "Pending"}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {node.kind === "primitive" && <DisputePanel eventId={eventId} />}
          <Card title="On-chain history" icon={GitBranch}>
            <p className="mb-5 text-sm text-gray-600">
              Rebuilt from the Registry and DisputeManager logs. Each observation carries an evidence hash; expand it to see exactly
              what that resolver read.
            </p>
            <Timeline items={timeline} loading={tlLoading} />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {node.kind === "primitive" && node.spec ? (
            <Card title="What it asks" icon={Layers}>
              <dl className="divide-y divide-gray-100 text-sm">
                {specRows(node.spec).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-3 py-2">
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{k}</dt>
                    <dd className="text-gray-800 [overflow-wrap:anywhere]">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : (
            <Card title="Built from" icon={Layers}>
              <ul className="space-y-2">
                {(node.children ?? []).map((c: EventNode) => (
                  <li key={c.id}>
                    <Link href={`/events/${c.id}`} className="link-plain flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 hover:border-violet-300">
                      <span className="min-w-0 truncate text-sm text-ink">{c.title}</span>
                      {c.status !== undefined && <EventStatusPill status={c.status} />}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                Composites have no resolvers of their own: they resolve from their operands, and a voided operand voids them.
                {node.windowSeconds ? ` Window: ${node.windowSeconds / 3600} h.` : ""}
              </p>
            </Card>
          )}

          {node.kind === "primitive" && node.spec && <ReusePanel node={node} />}

          <Card title={`Used by (${usage})`} icon={Store}>
            {usage === 0 ? (
              <p className="text-sm text-gray-500">No market or guard rule settles on this event yet — any protocol can, through the EventBus.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {users.markets.map((m) => (
                  <li key={m.marketId}>
                    <Link href={`/markets/${m.marketId}`} className="link-plain block rounded-xl border border-gray-200 px-3 py-2 hover:border-violet-300">
                      <span className="font-mono text-[10px] uppercase text-violet-600">yes/no market</span>
                      <span className="block text-ink">{m.question}</span>
                    </Link>
                  </li>
                ))}
                {users.ranges.map((d) => (
                  <li key={d.marketId}>
                    <Link href={`/markets/dist/${d.marketId}`} className="link-plain block rounded-xl border border-gray-200 px-3 py-2 hover:border-violet-300">
                      <span className="font-mono text-[10px] uppercase text-violet-600">range market · boundary</span>
                      <span className="block text-ink">{d.question}</span>
                    </Link>
                  </li>
                ))}
                {(rules ?? []).map((r) => (
                  <li key={`${r.token}-${r.pauseFrom}`} className="rounded-xl border border-gray-200 px-3 py-2">
                    <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-violet-600">
                      <ShieldCheck className="h-3 w-3" /> lending guard
                    </span>
                    <span className="block text-ink">
                      Pauses {r.ticker} liquidations while this is TRUE ({fmtTime(r.pauseFrom)} → {fmtTime(r.pauseUntil)}
                      {r.failClosed ? ", fail-closed until decided" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {explorer && (
            <p className="text-xs text-gray-500">
              Everything here is read from Robinhood Chain testnet ·{" "}
              <a className="text-violet-700 underline" href={`${explorer}/address/${deployment.eventRegistry}`} target="_blank" rel="noreferrer">
                EventRegistry ↗
              </a>
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
