"use client";

import type { TradeRow } from "@/lib/distribution";
import { fmtUsdg } from "@/lib/novak";
import { shortHex } from "@/lib/utils";

const COLORS = ["#0A0908", "#7c3aed", "#059669", "#d97706", "#dc2626", "#2563eb", "#db2777", "#0891b2", "#65a30d", "#78716c"];

/**
 * What's been happening: the probability of every range after each trade
 * (from the Trade events' `pricesAfter`), plus the latest trades.
 */
export function ActivityFeed({ trades, labels, startPrices }: { trades: TradeRow[]; labels: string[]; startPrices: number[] }) {
  const series = [startPrices, ...trades.map((t) => t.pricesAfter)];
  const W = 560;
  const H = 140;
  const x = (i: number) => (series.length <= 1 ? 0 : (i / (series.length - 1)) * W);
  const y = (p: number) => H - p * H;

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5">
      <p className="font-semibold text-ink">Activity</p>
      {trades.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No trades yet — every range starts at an equal probability.</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full min-w-[320px]" role="img" aria-label="Probability of each range over trades">
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeDasharray="4 4" />
              ))}
              {labels.map((_, b) => (
                <polyline
                  key={b}
                  fill="none"
                  stroke={COLORS[b % COLORS.length]}
                  strokeWidth={2}
                  points={series.map((p, i) => `${x(i)},${y(p[b] ?? 0)}`).join(" ")}
                />
              ))}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-gray-600">
            {labels.map((l, b) => (
              <span key={b} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2" style={{ background: COLORS[b % COLORS.length] }} /> {l}
              </span>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-gray-100 font-mono text-xs">
            {[...trades].reverse().slice(0, 12).map((t) => (
              <li key={t.txHash + t.bucket} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-gray-500">{shortHex(t.trader)}</span>
                <span className={t.isBuy ? "text-emerald-700" : "text-rose-700"}>
                  {t.isBuy ? "bought" : "sold"} {(Number(t.shares) / 1e6).toFixed(2)} × {labels[t.bucket]}
                </span>
                <span className="text-gray-700">{fmtUsdg(t.collateral)} USDG</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
