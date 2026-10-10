"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Portfolio sparklines and donuts — hand-rolled SVG on the site's validated categorical
 * palette (violet · cyan · amber · pink, checked for CVD separation), thin 2px
 * lines, recessive grid, one axis, crosshair + tooltip, legends with values.
 */
export const SERIES = ["#7c3aed", "#0891b2", "#d97706", "#db2777"] as const;
export const OTHER = "#9ca3af";

const usd = (v: number, dp = 2) => `$${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
// --- Sparkline --------------------------------------------------------------------

export function Sparkline({ points, width = 96, height = 32 }: { points: { t: number; p: number }[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="font-mono text-[10px] text-gray-400">—</span>;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const lo = Math.min(...points.map((q) => q.p));
  const hi = Math.max(...points.map((q) => q.p));
  const x = (t: number) => 2 + ((t - t0) / Math.max(1, t1 - t0)) * (width - 4);
  const y = (p: number) => 3 + (1 - (p - lo) / Math.max(1e-6, hi - lo)) * (height - 6);
  const d = points.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join("");
  const up = points[points.length - 1].p >= points[0].p;
  return (
    <svg width={width} height={height} aria-label={`${Math.round(points[0].p * 100)}¢ → ${Math.round(points[points.length - 1].p * 100)}¢`} role="img">
      <path d={d} fill="none" stroke={up ? "#059669" : "#e11d48"} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(t1)} cy={y(points[points.length - 1].p)} r={2.5} fill={up ? "#059669" : "#e11d48"} />
    </svg>
  );
}

// --- Donut ------------------------------------------------------------------------

export interface Slice {
  label: string;
  value: number;
  color: string;
  hint?: string;
}

/** ≤ 4 hues in fixed order; anything beyond folds into a gray "Other". */
export function toSlices(rows: { label: string; value: number; hint?: string }[]): Slice[] {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.length > SERIES.length ? sorted.slice(0, SERIES.length - 1) : sorted;
  const rest = sorted.slice(head.length);
  const slices: Slice[] = head.map((r, i) => ({ ...r, color: SERIES[i] }));
  if (rest.length) slices.push({ label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: OTHER });
  return slices;
}

export function Donut({ slices, center, size = 176, stacked }: { slices: Slice[]; center: string; size?: number; stacked?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2;
  const inner = r * 0.64;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const a1 = a0 + sweep;
    const big = sweep > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
    const d =
      sweep >= Math.PI * 2 - 1e-6
        ? `M${p(-Math.PI / 2, r - 1)}A${r - 1},${r - 1} 0 1 1 ${p(Math.PI * 1.5 - 1e-4, r - 1)}L${p(Math.PI * 1.5 - 1e-4, inner)}A${inner},${inner} 0 1 0 ${p(-Math.PI / 2, inner)}Z`
        : `M${p(a0, r - 1)}A${r - 1},${r - 1} 0 ${big} 1 ${p(a1, r - 1)}L${p(a1, inner)}A${inner},${inner} 0 ${big} 0 ${p(a0, inner)}Z`;
    a0 = a1;
    return d;
  });
  const shown = active === null ? null : slices[active];

  return (
    <div className={cn("flex flex-col items-center gap-4", !stacked && "sm:flex-row sm:items-center")}>
      <div className="relative flex-none" style={{ width: size, height: size }}>
        {total === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-full border-[18px] border-violet-50 text-xs text-gray-400">no data</div>
        ) : (
          <svg width={size} height={size} role="img" aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
            {arcs.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={slices[i].color}
                stroke="white"
                strokeWidth={2}
                opacity={active === null || active === i ? 1 : 0.35}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                className="cursor-pointer transition-opacity"
              />
            ))}
          </svg>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[10px] uppercase tracking-wide text-gray-500">{shown ? shown.label : "total"}</span>
          <span className="text-lg font-bold text-ink">{shown ? usd(shown.value) : center}</span>
          {shown && total > 0 && <span className="text-[11px] text-gray-500">{((shown.value / total) * 100).toFixed(1)}%</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li
            key={s.label}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            className={cn("flex items-center gap-2 rounded-lg px-2 py-1", active === i && "bg-violet-50")}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-gray-700">{s.label}</span>
            <span className="font-mono text-xs text-gray-500">{total > 0 ? `${Math.round((s.value / total) * 100)}%` : ""}</span>
            <span className="w-20 text-right font-semibold text-ink">{usd(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
