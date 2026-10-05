"use client";

import type { DistributionView, Signal } from "@/lib/distribution";
import { signalFor } from "@/lib/distribution";

const BADGE: Record<Signal, { label: string; cls: string }> = {
  buy: { label: "Underpriced — consider buying", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  hold: { label: "Fairly priced — hold", cls: "bg-gray-50 text-gray-700 border-gray-200" },
  sell: { label: "Overpriced — consider selling / avoid", cls: "bg-rose-50 text-rose-800 border-rose-200" },
};

/**
 * "What to do" for each range: compares the market's price (its implied
 * probability) with a simple model — a lognormal centred on the live
 * Chainlink spot, using the feed's own realized volatility and the time left
 * until T. Informational only: models are wrong, markets know things models
 * don't, and nothing here is financial advice.
 */
export function InsightsPanel({
  view,
  model,
  spot,
  annualVol,
  held,
}: {
  view: DistributionView;
  model?: number[];
  spot?: number;
  annualVol?: number | null;
  held: bigint[];
}) {
  if (!model || spot === undefined) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-5">
        <p className="font-semibold text-ink">Insights</p>
        <p className="mt-2 text-sm text-gray-500">Loading the live Chainlink price and volatility…</p>
      </div>
    );
  }

  const rows = view.labels.map((label, i) => ({ label, i, market: view.prices[i], model: model[i], ...signalFor(model[i], view.prices[i]) }));
  const leans = rows.reduce((a, b) => (b.market > a.market ? b : a));
  const best = rows.reduce((a, b) => (b.edge > a.edge ? b : a));
  const mids = view.thresholds.length
    ? [view.thresholds[0] * 0.99, ...view.thresholds.slice(1).map((t, i) => (t + view.thresholds[i]) / 2), view.thresholds[view.thresholds.length - 1] * 1.01]
    : [];
  const expected = mids.length ? rows.reduce((s, r) => s + r.market * mids[r.i], 0) : undefined;
  const heldOverpriced = rows.filter((r) => r.signal === "sell" && (held[r.i] ?? 0n) > 0n);

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">Insights: what the market is saying</p>
        <p className="font-mono text-[11px] text-gray-500">
          spot ${spot.toLocaleString(undefined, { maximumFractionDigits: 2 })} · vol {annualVol ? `${(annualVol * 100).toFixed(0)}%/yr` : "default"}
        </p>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        <li>
          Market leans <strong>{leans.label}</strong> ({(leans.market * 100).toFixed(0)}%).
        </li>
        {expected !== undefined && (
          <li>
            Market-implied expected price ≈ <strong>${expected.toFixed(2)}</strong> vs spot ${spot.toFixed(2)} (
            {expected >= spot ? "slightly bullish" : "slightly bearish"}).
          </li>
        )}
        {best.signal === "buy" && (
          <li>
            Biggest gap: <strong>{best.label}</strong> trades at {(best.market * 100).toFixed(0)}% but the model says{" "}
            {(best.model * 100).toFixed(0)}%.
          </li>
        )}
        {heldOverpriced.map((r) => (
          <li key={r.i} className="text-rose-800">
            You hold shares in <strong>{r.label}</strong>, which looks overpriced — selling locks in today&apos;s price.
          </li>
        ))}
      </ul>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="font-mono uppercase text-gray-500 border-b border-gray-200">
            <tr>
              <th className="py-1.5">Range</th>
              <th className="py-1.5 text-right">Market</th>
              <th className="py-1.5 text-right">Model</th>
              <th className="py-1.5 pl-3">Signal</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.i} className="border-b border-gray-100">
                <td className="py-1.5 text-ink">{r.label}</td>
                <td className="py-1.5 text-right">{(r.market * 100).toFixed(1)}%</td>
                <td className="py-1.5 text-right text-violet-700">{(r.model * 100).toFixed(1)}%</td>
                <td className="py-1.5 pl-3">
                  <span className={`inline-block border px-1.5 py-0.5 rounded-sm text-[10px] ${BADGE[r.signal].cls}`}>{BADGE[r.signal].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-500">
        Model: lognormal around the live Chainlink spot, using the feed&apos;s realized volatility and the time left until T.
        Signals flag gaps over 5 points. Informational only — not financial advice.
      </p>
    </div>
  );
}
