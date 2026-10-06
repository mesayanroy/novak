"use client";

import Link from "next/link";
import { DistributionStatus, MarketStatus } from "@novakoracle/sdk";
import { categoryForFeed, fmtTime, fmtUsdg, tickersOf, type LiveMarket, type MarketCategory } from "@/lib/novak";
import type { DistributionView } from "@/lib/distribution";
import { fmtPrice, useFeedRounds, useFeedRow } from "@/lib/feeds";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { AssetIcon, AssetStack } from "./AssetIcon";
import { Sparkline } from "./Sparkline";
import { CalendarDays, ShieldCheck } from "lucide-react";

export type FeedItem =
  | { kind: "binary"; market: LiveMarket }
  | { kind: "range"; view: DistributionView; category?: MarketCategory };

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const now = () => BigInt(Math.floor(Date.now() / 1000));

/** Live Chainlink price chip + sparkline for the market's underlying feed. */
function LivePrice({ feed, ticker }: { feed?: `0x${string}`; ticker?: string }) {
  const row = useFeedRow(feed);
  const { data } = useFeedRounds(feed, 30);
  const series = data?.rounds.map((r) => r.price) ?? [];
  if (!feed) return null;
  const first = series[0];
  const last = row?.price ?? series[series.length - 1];
  const change = first && last ? ((last - first) / first) * 100 : undefined;
  return (
    <div className="flex items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wide text-violet-500">{ticker} · Chainlink live</p>
        <p className="text-sm font-semibold text-gray-900">
          {last !== undefined ? fmtPrice(last) : "…"}
          {change !== undefined && (
            <span className={`ml-1.5 text-xs font-medium ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
            </span>
          )}
        </p>
      </div>
      <Sparkline values={series} width={110} height={36} />
    </div>
  );
}

function Shell({ href, children, example }: { href: string; children: React.ReactNode; example?: boolean }) {
  return (
    <Link
      href={href}
      className="link-plain group flex flex-col gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_1px_2px_rgba(80,60,180,0.06)] transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_10px_30px_-12px_rgba(109,74,255,0.45)]"
    >
      {example && <ExampleDataBadge className="self-start" />}
      {children}
    </Link>
  );
}

export function PredictionCard({ item }: { item: FeedItem }) {
  if (item.kind === "binary") return <BinaryCard market={item.market} />;
  return <RangeCard view={item.view} />;
}

function BinaryCard({ market }: { market: LiveMarket }) {
  const total = market.yesPool + market.noPool;
  const yes = total > 0n ? Number((market.yesPool * 10_000n) / total) / 10_000 : 0.5;
  const e = market.event;
  const settled = market.status !== MarketStatus.Open;
  const closed = !settled && now() >= market.tradingClosesAt;

  return (
    <Shell href={`/markets/${market.marketId}`} example={market.isExample}>
      <div className="flex items-start gap-3">
        <AssetStack tickers={tickersOf(e)} category={e.category} />
        <h3 className="flex-1 text-[15px] font-semibold leading-snug text-gray-900 group-hover:text-violet-700">
          {market.question || e.title}
        </h3>
        <div className="flex-none text-right">
          {settled ? (
            <p className="text-sm font-bold text-violet-700">
              {market.status === MarketStatus.Refunding ? "Refunded" : `Resolved ${market.outcome ? "YES" : "NO"}`}
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold leading-none text-violet-700">{Math.round(yes * 100)}%</p>
              <p className="mt-0.5 text-[11px] text-gray-500">Yes chance</p>
            </>
          )}
        </div>
      </div>

      <LivePrice feed={e.feed} ticker={e.ticker} />

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{fmtUsdg(total)} USDG Vol.</span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {settled ? "Settled" : closed ? "Resolving" : fmtTime(market.tradingClosesAt)}
        </span>
        <span className="ml-auto flex items-center gap-1 text-violet-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Novak dispute layer
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <span className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${settled && market.outcome ? "bg-emerald-600 text-white" : "bg-violet-600 text-white"}`}>
          Yes {cents(yes)}
        </span>
        <span className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${settled && !market.outcome && market.status === MarketStatus.Settled ? "bg-emerald-600 text-white" : "bg-violet-50 text-violet-700"}`}>
          No {cents(1 - yes)}
        </span>
      </div>
    </Shell>
  );
}

function RangeCard({ view }: { view: DistributionView }) {
  const settled = view.status !== DistributionStatus.Open;
  const order = view.prices.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const lead = order[0];
  const top = order.slice(0, 3).sort((a, b) => a.i - b.i);
  const volume = view.outstanding.reduce((s, q) => s + q, 0n);
  const closed = !settled && now() >= view.tradingClosesAt;
  const category: MarketCategory = view.feed ? categoryForFeed(view.feed) : "stocks";

  return (
    <Shell href={`/markets/dist/${view.marketId}`}>
      <div className="flex items-start gap-3">
        <AssetIcon ticker={view.ticker} category={category} />
        <h3 className="flex-1 text-[15px] font-semibold leading-snug text-gray-900 group-hover:text-violet-700">
          {view.question.split(" (")[0]}
          {category === "bonds" && (
            <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-emerald-700">
              Tokenized Treasury
            </span>
          )}
        </h3>
        <div className="flex-none text-right">
          {settled ? (
            <p className="text-sm font-bold text-violet-700">
              {view.status === DistributionStatus.Voided ? "Voided" : view.labels[view.winningBucket]}
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold leading-none text-violet-700">{Math.round(lead.p * 100)}%</p>
              <p className="mt-0.5 text-[11px] text-gray-500">{view.labels[lead.i]}</p>
            </>
          )}
        </div>
      </div>

      <LivePrice feed={view.feed} ticker={view.ticker} />

      {/* mini distribution */}
      <div className="flex h-10 items-end gap-1" aria-hidden>
        {view.prices.map((p, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t ${settled && view.winningBucket === i ? "bg-emerald-500" : i === lead.i ? "bg-violet-600" : "bg-violet-200"}`}
            style={{ height: `${Math.max(8, (p / lead.p) * 100)}%` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{fmtUsdg(volume)} shares out</span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {settled ? "Settled" : closed ? "Resolving" : fmtTime(view.tradingClosesAt)}
        </span>
        <span className="ml-auto text-violet-500">{view.nBuckets} ranges</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {top.map(({ p, i }) => (
          <span
            key={i}
            className={`rounded-xl px-2 py-2 text-center text-xs font-semibold ${i === lead.i ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700"}`}
          >
            <span className="block truncate font-normal opacity-90">{view.labels[i]}</span>
            {cents(p)}
          </span>
        ))}
      </div>
    </Shell>
  );
}
