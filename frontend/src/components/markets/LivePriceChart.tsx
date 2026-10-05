"use client";

import { useId } from "react";
import type { Hex } from "@novak/sdk";
import { fmtPrice, useFeedRounds, useFeedRow } from "@/lib/feeds";
import { AssetIcon } from "./AssetIcon";

/**
 * The underlying asset's recent Chainlink rounds (Robinhood Chain mainnet),
 * with the market's thresholds drawn across it — so traders see exactly where
 * the live price sits relative to what the market settles on.
 */
export function LivePriceChart({ feed, ticker, thresholds = [] }: { feed?: Hex; ticker?: string; thresholds?: number[] }) {
  const id = useId().replace(/:/g, "");
  const row = useFeedRow(feed);
  const { data, isLoading } = useFeedRounds(feed, 60);
  if (!feed) return null;
  const rounds = data?.rounds ?? [];
  const W = 640;
  const H = 180;
  const prices = rounds.map((r) => r.price);
  const recent = prices.slice(-20);
  const lo = Math.min(...recent, ...thresholds) * 0.9995;
  const hi = Math.max(...recent, ...thresholds) * 1.0005;
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
  const x = (i: number) => (rounds.length <= 1 ? 0 : (i / (rounds.length - 1)) * W);
  const clamp = (v: number) => Math.min(H - 2, Math.max(2, v));
  const line = prices.map((p, i) => `${x(i).toFixed(1)},${clamp(y(p)).toFixed(1)}`).join(" ");
  const last = row?.price ?? prices[prices.length - 1];
  const first = prices[0];
  const change = first && last ? ((last - first) / first) * 100 : undefined;
  const updated = row?.updatedAt ?? rounds[rounds.length - 1]?.updatedAt;

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-violet-500">
            <AssetIcon ticker={ticker} size={18} />
            {ticker} · Chainlink price feed (live)
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {last !== undefined ? fmtPrice(last) : "…"}
            {change !== undefined && (
              <span className={`ml-2 text-sm font-semibold ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% over {rounds.length} rounds
              </span>
            )}
          </p>
        </div>
        <a
          className="font-mono text-[11px] text-gray-500 underline"
          href={`https://robinhoodchain.blockscout.com/address/${feed}`}
          target="_blank"
          rel="noreferrer"
        >
          feed {feed.slice(0, 8)}… · {updated ? new Date(updated * 1000).toLocaleString() : ""}
        </a>
      </div>
      {isLoading ? (
        <div className="mt-3 h-44 animate-pulse rounded-xl bg-violet-50" />
      ) : rounds.length > 1 ? (
        <div className="mt-3 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full min-w-[320px]" role="img" aria-label={`${ticker} price history`}>
            <defs>
              <linearGradient id={`pg${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {thresholds.map((t, i) => (
              <g key={t}>
                <line x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="#c4b5fd" strokeDasharray="5 5" />
                {/* skip labels that would collide with the previous one */}
                {(i === 0 || Math.abs(y(t) - y(thresholds[i - 1])) > 12) && (
                <text x={W - 4} y={y(t) - 3} textAnchor="end" fontSize="10" fill="#7c3aed">
                  {fmtPrice(t)}
                </text>
                )}
              </g>
            ))}
            <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#pg${id})`} />
            <polyline points={line} fill="none" stroke="#6d4aff" strokeWidth={2.5} strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">No round history available.</p>
      )}
      <p className="mt-2 text-[11px] text-gray-500">
        Read straight from the Chainlink proxy on Robinhood Chain mainnet. Stock feeds update 24/5 and hold the last price
        while markets are closed.
      </p>
    </div>
  );
}
