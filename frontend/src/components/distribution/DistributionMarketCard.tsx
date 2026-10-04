"use client";

import Link from "next/link";
import { DistributionStatus } from "@novak/sdk";
import { fmtTime, fmtUsdg } from "@/lib/novak";
import type { DistributionView } from "@/lib/distribution";
import { BarChart3 } from "lucide-react";

/** Compact card: a mini distribution plus status — links to the market page. */
export function DistributionMarketCard({ view }: { view: DistributionView }) {
  const max = Math.max(...view.prices, 0.01);
  const lean = view.prices.indexOf(Math.max(...view.prices));
  const status =
    view.status === DistributionStatus.Settled
      ? `Settled · ${view.labels[view.winningBucket]} won`
      : view.status === DistributionStatus.Voided
        ? "Voided · refunds 1/N"
        : BigInt(Math.floor(Date.now() / 1000)) < view.tradingClosesAt
          ? `Closes ${fmtTime(view.tradingClosesAt)}`
          : "Resolving";
  return (
    <Link
      href={`/markets/dist/${view.marketId}`}
      className="link-plain block border border-gray-300 bg-paper p-5 rounded-sm transition-all hover:border-ink hover:shadow-md"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-gray-500">
        <BarChart3 className="h-3 w-3" /> Distribution · {view.ticker} · {view.nBuckets} ranges
      </div>
      <h3 className="mt-1.5 font-medium text-ink">{view.question.split(" (")[0]}</h3>
      <div className="mt-3 flex h-16 items-end gap-1">
        {view.prices.map((p, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${view.status === DistributionStatus.Settled && view.winningBucket === i ? "bg-emerald-600" : i === lean ? "bg-violet-700" : "bg-ink"}`}
            style={{ height: `${(p / max) * 100}%` }}
            title={`${view.labels[i]}: ${(p * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-xs text-gray-600">
        <span>
          Leans <strong className="text-ink">{view.labels[lean]}</strong> ({(view.prices[lean] * 100).toFixed(0)}%)
        </span>
        <span>{status}</span>
        <span>{fmtUsdg(view.reserve)} USDG reserve</span>
      </div>
    </Link>
  );
}
