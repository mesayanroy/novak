"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { DistributionStatus, MarketStatus } from "@novakoracle/sdk";
import { Marquee } from "@/components/ui/marquee";
import { categoryForFeed, type LiveMarket, type MarketCategory } from "@/lib/novak";
import type { DistributionView } from "@/lib/distribution";
import type { CommunityView } from "@/lib/community";
import { fmtPrice, useLiveFeeds, useSparklines } from "@/lib/feeds";
import { PredictionCard, SparklineContext, type FeedItem } from "./PredictionCard";
import { ArrowRight, Search } from "lucide-react";

type Pill = "all" | "stocks" | "bonds" | "crypto" | "macro" | "ranges" | "corporate" | "community";
const PILLS: Array<[Pill, string]> = [
  ["all", "All"],
  ["stocks", "Stocks"],
  ["bonds", "Bonds"],
  ["crypto", "Crypto"],
  ["macro", "Macro"],
  ["ranges", "Ranges"],
  ["corporate", "Corporate actions"],
  ["community", "Community"],
];

const categoryOf = (item: FeedItem): MarketCategory | "community" =>
  item.kind === "community"
    ? "community"
    : item.kind === "binary"
      ? (item.market.event.category ?? "other")
      : item.view.feed
        ? categoryForFeed(item.view.feed)
        : "stocks";
const idOf = (i: FeedItem) => `${i.kind}:${i.kind === "binary" ? i.market.marketId : i.view.marketId}`;

const PAGE = 24;

/** Live Chainlink prices scrolling across the top — the raw inputs. */
function LiveTickerStrip() {
  const { data } = useLiveFeeds();
  const rows = (data?.rows ?? []).filter((r) => r.price !== null && (r.assetClass === "Equity" || r.symbol === "SGOV" || ["ETH", "BTC", "LINK", "GLD"].includes(r.symbol)));
  if (rows.length === 0) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white py-2">
      <Marquee pauseOnHover className="[--duration:60s] [--gap:1.5rem]">
        {rows.map((r) => (
          <span key={r.feed} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className={`rounded-md px-1.5 py-0.5 font-bold ${r.symbol === "SGOV" ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
              {r.symbol}
            </span>
            <span className="font-mono text-gray-800">{fmtPrice(r.price!)}</span>
          </span>
        ))}
      </Marquee>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-violet-600 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase text-white">
        Chainlink live
      </span>
    </div>
  );
}

/**
 * The markets home: purple/white prediction-market feed (yes/no + range
 * markets in one list), category pills, search, and a live Chainlink strip.
 * Every card shows the live price of the asset it settles on.
 */
export function MarketFeed({
  markets,
  dists,
  community = [],
  loading,
  error,
  onCreate,
}: {
  markets: LiveMarket[];
  dists: DistributionView[];
  community?: CommunityView[];
  loading: boolean;
  error?: Error | null;
  onCreate: () => void;
}) {
  const [pill, setPill] = useState<Pill>("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const all = useMemo<FeedItem[]>(
    () => [
      ...community.map((view) => ({ kind: "community" as const, view })),
      ...dists.map((view) => ({ kind: "range" as const, view })),
      ...markets.map((market) => ({ kind: "binary" as const, market })),
    ],
    [markets, dists, community],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<Pill, number>> = { all: all.length, ranges: all.filter((i) => i.kind === "range").length };
    for (const i of all) {
      const k = categoryOf(i) as Pill;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [all]);

  const items = useMemo(() => {
    const open = (i: FeedItem) =>
      i.kind === "binary" ? i.market.status === MarketStatus.Open : i.kind === "community" ? i.view.status === 0 : i.view.status === DistributionStatus.Open;
    const closes = (i: FeedItem) => Number(i.kind === "binary" ? i.market.tradingClosesAt : i.kind === "community" ? i.view.closesAt : i.view.tradingClosesAt);
    return all
      .filter((i) => {
        if (pill === "ranges" && i.kind !== "range") return false;
        if (pill !== "all" && pill !== "ranges" && categoryOf(i) !== pill) return false;
        if (!q) return true;
        const text =
          i.kind === "binary" ? `${i.market.question} ${i.market.event.title}` : i.kind === "community" ? `${i.view.question} ${i.view.outcomes.join(" ")} ${i.view.category}` : i.view.question;
        return text.toLowerCase().includes(q.toLowerCase());
      })
      // Open first, soonest to close first; then settled, newest first.
      .sort((a, b) => Number(open(b)) - Number(open(a)) || (open(a) ? closes(a) - closes(b) : closes(b) - closes(a)));
  }, [all, pill, q]);

  // One request for every visible card's trend line.
  const visible = items.slice(0, shown);
  const feeds = visible.flatMap((i) => {
    const f = i.kind === "binary" ? i.market.event.feed : i.kind === "range" ? i.view.feed : undefined;
    return f ? [f] : [];
  });
  const { data: sparks } = useSparklines(feeds);

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/70 to-violet-100/60 p-6 shadow-[0_10px_40px_-12px_rgba(124,92,255,0.25)] sm:p-8 md:min-h-[300px]">
        {/* very light violet glow behind the Capitol */}
        <div className="pointer-events-none absolute -right-10 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="pointer-events-none absolute right-40 -bottom-24 h-56 w-56 rounded-full bg-fuchsia-200/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] [mask-image:linear-gradient(to_right,transparent,black_40%)] md:block">
          <Image
            src="/capitol.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 55vw, 0px"
            className="object-contain object-right-bottom drop-shadow-[0_0_28px_rgba(139,92,246,0.28)]"
          />
        </div>
        {/* phones: a soft, small version tucked in the corner */}
        <div className="pointer-events-none absolute -bottom-4 -right-8 h-40 w-60 opacity-25 md:hidden">
          <Image src="/capitol.webp" alt="" fill sizes="240px" className="object-contain object-right-bottom" />
        </div>
        <div className="relative max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Trade on real-world events</h2>
          <p className="mt-2 text-sm text-gray-600">
            Prediction and range markets on tokenized stocks, tokenized Treasuries and the Fed — priced by live Chainlink
            feeds, settled by Novak&apos;s dispute layer: independent resolvers, bonded committees, never a token vote.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              Create a market <ArrowRight className="h-4 w-4" />
            </button>
            <Link href="/feeds" className="link-plain inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-violet-700 border border-violet-200 hover:border-violet-400">
              See live feeds
            </Link>
          </div>
        </div>
      </div>

      <LiveTickerStrip />

      {/* Pills + search */}
      <div className="flex flex-wrap items-center gap-2">
        {PILLS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setPill(key);
              setShown(PAGE);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              pill === key ? "bg-gray-900 text-white" : "bg-white text-gray-700 border border-gray-200 hover:border-violet-300"
            }`}
          >
            {label}
            {counts[key] ? <span className={`ml-1.5 font-mono text-[11px] ${pill === key ? "text-violet-200" : "text-gray-400"}`}>{counts[key]}</span> : null}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search NVDA, SGOV, Fed…"
            className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-60 animate-pulse rounded-2xl border border-violet-100 bg-violet-50/50" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-700">Couldn&apos;t read markets from chain: {error.message}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-violet-100 bg-white p-8 text-center text-sm text-gray-600">
          No live markets here right now — finished markets leave this list once trading closes (find them in your Portfolio).{" "}
          <button onClick={onCreate} className="font-semibold text-violet-700 underline">
            Create one from any live Chainlink feed
          </button>
          .
        </div>
      ) : (
        <>
          <SparklineContext.Provider value={sparks}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((i) => (
                <PredictionCard key={idOf(i)} item={i} />
              ))}
            </div>
          </SparklineContext.Provider>
          {items.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mx-auto rounded-full border border-violet-200 bg-white px-5 py-2 text-sm font-semibold text-violet-700 hover:border-violet-400"
            >
              Show more ({items.length - shown} more)
            </button>
          )}
        </>
      )}
    </div>
  );
}
