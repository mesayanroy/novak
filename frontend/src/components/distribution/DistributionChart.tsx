"use client";

/**
 * The market's probability distribution: one bar per price range (LMSR
 * prices, which always sum to 100%), an outline for the model's estimate,
 * a marker on the range containing the live Chainlink spot price, and the
 * winning range once settled. Click a bar to select it for trading.
 */
export function DistributionChart({
  labels,
  prices,
  model,
  spotBucket,
  winningBucket,
  selected,
  onSelect,
}: {
  labels: string[];
  prices: number[];
  model?: number[];
  spotBucket?: number;
  winningBucket?: number;
  selected?: number;
  onSelect?: (bucket: number) => void;
}) {
  const max = Math.max(0.25, ...prices, ...(model ?? []));
  return (
    <div className="border border-gray-300 bg-paper p-5 rounded-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">Market distribution</p>
        <div className="flex items-center gap-4 font-mono text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 bg-ink" /> market price
          </span>
          {model && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 border-2 border-dashed border-violet-500" /> model
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex h-52 items-end gap-2" role="list">
        {prices.map((p, i) => {
          const isWin = winningBucket === i;
          const isSel = selected === i;
          return (
            <button
              key={i}
              type="button"
              role="listitem"
              onClick={() => onSelect?.(i)}
              className={`group relative flex h-full flex-1 flex-col justify-end rounded-sm ${isSel ? "bg-gray-100" : ""}`}
              aria-label={`${labels[i]}: ${(p * 100).toFixed(1)}%`}
            >
              <span className="mb-1 text-center font-mono text-[11px] font-semibold text-ink">{(p * 100).toFixed(1)}%</span>
              <div className="relative w-full" style={{ height: `${(p / max) * 80}%` }}>
                <div className={`absolute inset-0 rounded-t-sm ${isWin ? "bg-emerald-600" : isSel ? "bg-violet-700" : "bg-ink"}`} />
              </div>
              {model && (
                <div
                  className="pointer-events-none absolute bottom-0 left-1 right-1 border-2 border-dashed border-violet-500 rounded-t-sm"
                  style={{ height: `calc(${(model[i] / max) * 80}% )`, marginBottom: 0 }}
                />
              )}
              {spotBucket === i && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-amber-100 px-1 font-mono text-[9px] text-amber-800">
                  spot
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {labels.map((l, i) => (
          <span key={i} className={`flex-1 text-center font-mono text-[10px] ${winningBucket === i ? "text-emerald-700 font-bold" : "text-gray-600"}`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
