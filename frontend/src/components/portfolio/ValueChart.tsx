"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { HistoryPoint } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/lib/theme";

/**
 * Portfolio value over time on TradingView's Lightweight Charts: value
 * (marked at the market price after each event, exit value now) against net
 * invested, with a P&L pane underneath. "Candles" groups the same history into
 * OHLC candles of portfolio value per interval.
 */

const UP = "#16a34a";
const DOWN = "#dc2626";
const INK = "#0a0a0a";
const VIOLET = "#7c3aed";

const RANGES = [
  { k: "24H", s: 86_400, bucket: 3600 },
  { k: "7D", s: 7 * 86_400, bucket: 4 * 3600 },
  { k: "30D", s: 30 * 86_400, bucket: 86_400 },
  { k: "ALL", s: Infinity, bucket: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["k"];
type Mode = "value" | "candles" | "pnl";

const usd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${usd(Math.abs(v))}`;

/** One point per timestamp (the last), strictly increasing — what the chart needs. */
function dedupe(points: HistoryPoint[]): HistoryPoint[] {
  const m = new Map<number, HistoryPoint>();
  for (const p of points) m.set(p.t, p);
  return [...m.values()].sort((a, b) => a.t - b.t);
}

export function ValueChart({ history }: { history: HistoryPoint[] }) {
  const [range, setRange] = useState<RangeKey>("ALL");
  const [mode, setMode] = useState<Mode>("value");
  const [hover, setHover] = useState<HistoryPoint | null>(null);

  const pts = useMemo(() => {
    const all = dedupe(history);
    if (!all.length) return [];
    const span = RANGES.find((r) => r.k === range)!.s;
    const end = all[all.length - 1].t;
    if (!Number.isFinite(span)) return all;
    const start = end - span;
    const before = [...all].reverse().find((p) => p.t < start);
    const inside = all.filter((p) => p.t >= start);
    return before ? dedupe([{ ...before, t: start }, ...inside]) : inside;
  }, [history, range]);

  const candles = useMemo(() => {
    if (pts.length < 2) return [];
    const cfg = RANGES.find((r) => r.k === range)!;
    const span = pts[pts.length - 1].t - pts[0].t;
    const b = cfg.bucket || (span > 20 * 86_400 ? 86_400 : span > 3 * 86_400 ? 4 * 3600 : 3600);
    const out: { time: number; open: number; high: number; low: number; close: number; invested: number }[] = [];
    let prev: number | undefined;
    for (const p of pts) {
      const t = Math.floor(p.t / b) * b;
      const c = out[out.length - 1];
      if (c && c.time === t) {
        c.high = Math.max(c.high, p.value);
        c.low = Math.min(c.low, p.value);
        c.close = p.value;
        c.invested = p.invested;
      } else {
        const o = prev ?? p.value;
        out.push({ time: t, open: o, high: Math.max(o, p.value), low: Math.min(o, p.value), close: p.value, invested: p.invested });
      }
      prev = p.value;
    }
    return out;
  }, [pts, range]);

  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const byTime = useRef(new Map<number, HistoryPoint>());

  const dark = useIsDark();
  const th = dark
    ? { bg: "#15131b", text: "#aaa5b3", grid: "#221f29", border: "#2d2a35", ink: "#f3f1f8", label: "#2f2354" }
    : { bg: "#ffffff", text: "#71717a", grid: "#f4f4f5", border: "#e4e4e7", ink: INK, label: INK };

  useEffect(() => {
    if (!box.current || pts.length < 2) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: th.bg }, textColor: th.text, fontSize: 11, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", panes: { separatorColor: th.grid } },
      grid: { vertLines: { visible: false }, horzLines: { color: th.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.08 } },
      timeScale: { borderColor: th.border, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#c4b5fd", style: LineStyle.Dashed, labelBackgroundColor: th.label },
        horzLine: { color: "#c4b5fd", style: LineStyle.Dashed, labelBackgroundColor: th.label },
      },
      localization: { priceFormatter: (p: number) => usd(p) },
      handleScroll: false,
      handleScale: false,
    });
    const T = (t: number) => t as UTCTimestamp as Time;
    byTime.current = new Map(pts.map((p) => [p.t, p]));

    if (mode === "candles") {
      const s = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN });
      s.setData(candles.map((c) => ({ time: T(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
      const inv = chart.addSeries(LineSeries, { color: th.ink, lineWidth: 1, lineStyle: LineStyle.Dashed, lineType: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
      inv.setData(candles.map((c) => ({ time: T(c.time), value: c.invested })));
    } else if (mode === "pnl") {
      const s = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topLineColor: UP,
        topFillColor1: "rgba(22,163,74,0.25)",
        topFillColor2: "rgba(22,163,74,0.02)",
        bottomLineColor: DOWN,
        bottomFillColor1: "rgba(220,38,38,0.02)",
        bottomFillColor2: "rgba(220,38,38,0.25)",
        lineWidth: 2,
        lineType: 1,
      });
      s.setData(pts.map((p) => ({ time: T(p.t), value: p.value - p.invested })));
      s.createPriceLine({ price: 0, color: th.border, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    } else {
      const v = chart.addSeries(AreaSeries, { lineColor: VIOLET, topColor: "rgba(124,58,237,0.20)", bottomColor: "rgba(124,58,237,0)", lineWidth: 2, lineType: 1 });
      v.setData(pts.map((p) => ({ time: T(p.t), value: p.value })));
      const inv = chart.addSeries(LineSeries, { color: th.ink, lineWidth: 1, lineStyle: LineStyle.Dashed, lineType: 1, priceLineVisible: false, crosshairMarkerVisible: false });
      inv.setData(pts.map((p) => ({ time: T(p.t), value: p.invested })));
      // P&L pane underneath
      const pnl = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      pnl.setData(pts.map((p) => ({ time: T(p.t), value: p.value - p.invested, color: p.value - p.invested >= 0 ? "rgba(22,163,74,0.55)" : "rgba(220,38,38,0.55)" })));
      chart.panes()[1]?.setHeight(70);
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      if (p.time === undefined) return setHover(null);
      const t = p.time as number;
      const exact = byTime.current.get(t);
      setHover(exact ?? [...pts].reverse().find((x) => x.t <= t + (mode === "candles" ? 86_400 : 0)) ?? null);
    });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- th derives from dark
  }, [pts, candles, mode, dark]);

  const last = pts[pts.length - 1];
  const shown = hover ?? last;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Chart">
          {(
            [
              ["value", "Value"],
              ["candles", "Candles"],
              ["pnl", "P&L"],
            ] as [Mode, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={cn("rounded-full px-3 py-1 font-mono text-[11px] font-semibold", mode === k ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900")}
            >
              {l}
            </button>
          ))}
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

      {/* legend: always shows the hovered (or latest) point */}
      {shown && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
          <span className="text-gray-400">{new Date(shown.t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-0.5 w-3 rounded" style={{ background: VIOLET }} /> Value <span className="font-semibold text-gray-900">{usd(shown.value)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-0 w-3 border-t border-dashed border-gray-900" /> Invested <span className="font-semibold text-gray-900">{usd(shown.invested)}</span>
          </span>
          <span className="text-gray-500">
            P&amp;L{" "}
            <span className={cn("font-semibold", shown.value - shown.invested >= 0 ? "text-emerald-700" : "text-rose-700")}>
              {shown.value - shown.invested >= 0 ? "▲" : "▼"} {signed(shown.value - shown.invested)}
              {shown.invested > 0 ? ` (${(((shown.value - shown.invested) / shown.invested) * 100).toFixed(2)}%)` : ""}
            </span>
          </span>
        </div>
      )}

      <div className="relative mt-2 w-full">
        {pts.length < 2 ? (
          <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-violet-200 bg-violet-50/30 text-sm text-gray-500">
            Your value history starts with your first trade.
          </div>
        ) : (
          <div ref={box} className="h-[300px] w-full" />
        )}
      </div>
    </div>
  );
}
