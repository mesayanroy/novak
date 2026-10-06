"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryPoint } from "@/lib/activity";
import { cn } from "@/lib/utils";

/**
 * Portfolio charts — hand-rolled SVG on the site's validated categorical
 * palette (violet · cyan · amber · pink, checked for CVD separation), thin 2px
 * lines, recessive grid, one axis, crosshair + tooltip, legends with values.
 */
export const SERIES = ["#7c3aed", "#0891b2", "#d97706", "#db2777"] as const;
export const OTHER = "#9ca3af";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const usd = (v: number, dp = 2) => `$${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const niceStep = (span: number) => {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
};

// --- Value over time ------------------------------------------------------------

const RANGES = [
  { k: "24H", s: 86_400 },
  { k: "7D", s: 7 * 86_400 },
  { k: "30D", s: 30 * 86_400 },
  { k: "ALL", s: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["k"];

export function ValueChart({ history }: { history: HistoryPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [range, setRange] = useState<RangeKey>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const H = 300;
  const pad = { l: 56, r: 16, t: 16, b: 28 };

  const pts = useMemo(() => {
    if (history.length === 0) return [];
    const span = RANGES.find((r) => r.k === range)!.s;
    const end = history[history.length - 1].t;
    const start = Number.isFinite(span) ? end - span : history[0].t;
    const inside = history.filter((p) => p.t >= start);
    const before = [...history].reverse().find((p) => p.t < start);
    return before ? [{ ...before, t: start }, ...inside] : inside;
  }, [history, range]);

  const W = Math.max(width, 280);
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[pts.length - 1]?.t ?? 1;
  const maxV = Math.max(1, ...pts.map((p) => Math.max(p.value, p.invested)));
  const minV = Math.min(0, ...pts.map((p) => Math.min(p.value, p.invested)));
  const step = niceStep(maxV - minV);
  const yTop = Math.ceil(maxV / step) * step;
  const yBot = Math.floor(minV / step) * step;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yBot) / Math.max(1e-9, yTop - yBot)) * (H - pad.t - pad.b);
  const stepPath = (key: "value" | "invested") =>
    pts.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p[key])}` : `H${x(p.t)}V${y(p[key])}`)).join("");
  const area = pts.length ? `${stepPath("value")}H${x(t1)}V${y(Math.max(0, yBot))}H${x(t0)}Z` : "";
  const ticks: number[] = [];
  for (let v = yBot; v <= yTop + 1e-9; v += step) ticks.push(v);
  const xTicks = pts.length > 1 ? [0, 0.5, 1].map((f) => t0 + f * (t1 - t0)) : [];
  const fmtT = (t: number) =>
    new Date(t * 1000).toLocaleString(undefined, t1 - t0 > 2 * 86_400 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" });

  const at = hover === null ? null : [...pts].reverse().find((p) => p.t <= hover) ?? pts[0];
  const last = pts[pts.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES[0] }} /> Value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES[1] }} /> Net invested
          </span>
        </div>
        <div className="flex rounded-full border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.k}
              type="button"
              role="tab"
              aria-selected={range === r.k}
              onClick={() => setRange(r.k)}
              className={cn("rounded-full px-3 py-1 font-mono text-[11px] font-semibold", range === r.k ? "bg-violet-600 text-white" : "text-gray-500 hover:text-violet-700")}
            >
              {r.k}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="relative mt-3 w-full">
        {pts.length < 2 ? (
          <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-violet-200 bg-violet-50/30 text-sm text-gray-500">
            Your value history starts with your first trade.
          </div>
        ) : (
          <svg
            width={W}
            height={H}
            className="block touch-none select-none"
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = Math.min(Math.max(e.clientX - r.left, pad.l), W - pad.r);
              setHover(t0 + ((px - pad.l) / (W - pad.l - pad.r)) * (t1 - t0));
            }}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Portfolio value ${usd(last.value)}, net invested ${usd(last.invested)}`}
          >
            <defs>
              <linearGradient id="pv-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity="0.22" />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#d1d5db" : "#f1eefc"} />
                <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-gray-400 font-mono text-[10px]">
                  {usd(v, v % 1 ? 2 : 0)}
                </text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-gray-400 font-mono text-[10px]">
                {fmtT(t)}
              </text>
            ))}
            <path d={area} fill="url(#pv-area)" />
            <path d={stepPath("invested")} fill="none" stroke={SERIES[1]} strokeWidth={2} strokeLinejoin="round" />
            <path d={stepPath("value")} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" />
            {!at && (
              <circle cx={x(last.t)} cy={y(last.value)} r={4.5} fill={SERIES[0]} stroke="white" strokeWidth={2} />
            )}
            {at && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#c4b5fd" strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={y(at.invested)} r={4} fill={SERIES[1]} stroke="white" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(at.value)} r={4.5} fill={SERIES[0]} stroke="white" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {at && hover !== null && pts.length >= 2 && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-violet-100 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
            style={{ left: Math.min(Math.max(x(hover) + 12, 0), W - 200) }}
          >
            <p className="font-mono text-[10px] text-gray-500">{new Date(hover * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
            <p className="mt-1 flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES[0] }} /> Value
              </span>
              <span className="font-semibold text-ink">{usd(at.value)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES[1] }} /> Invested
              </span>
              <span className="font-semibold text-ink">{usd(at.invested)}</span>
            </p>
            <p className="mt-1 flex justify-between gap-2 border-t border-gray-100 pt-1">
              <span className="text-gray-600">P&amp;L</span>
              <span className="font-semibold text-ink">
                {at.value - at.invested >= 0 ? "▲ +" : "▼ −"}
                {usd(Math.abs(at.value - at.invested))}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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
