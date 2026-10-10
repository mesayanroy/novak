"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { feedByAddress, type Hex } from "@novakoracle/sdk";
import { useFeedLatest, useFeedRounds } from "@/lib/feeds";
import { bollinger, ema, priceAgo, pricePrecision, rsi, sma, toCandles, type Candle, type Round } from "@/lib/candles";
import { AssetIcon } from "./AssetIcon";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/lib/theme";

/**
 * TradingView-style chart of the market's underlying, built on TradingView's
 * open-source Lightweight Charts. Every candle is made of real Chainlink rounds
 * read from Robinhood Chain mainnet: the same rounds Novak's resolvers settle on.
 * The latest round is polled every 10 s; nothing is interpolated or simulated
 * between rounds.
 */

const UP = "#16a34a";
const DOWN = "#dc2626";
const INK = "#0a0a0a";
const VIOLET = "#7c3aed";
const MUTED = "#a1a1aa";

const INTERVALS = [
  { k: "15m", s: 900 },
  { k: "1H", s: 3600 },
  { k: "4H", s: 14_400 },
  { k: "1D", s: 86_400 },
] as const;
type IntervalKey = (typeof INTERVALS)[number]["k"];
type ChartType = "candles" | "line" | "area";
type Indicator = "sma" | "ema" | "bb" | "rsi" | "updates" | "levels";

const IND_LABEL: Record<Indicator, string> = { sma: "SMA 20", ema: "EMA 50", bb: "BB 20·2", rsi: "RSI 14", updates: "Updates", levels: "Market levels" };

const fmt = (v: number, p: number) => v.toLocaleString("en-US", { minimumFractionDigits: p, maximumFractionDigits: p });
const ago = (s: number) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function LivePriceChart({
  feed,
  ticker,
  thresholds = [],
  resolveAt,
}: {
  feed?: Hex;
  ticker?: string;
  thresholds?: number[];
  /** When the market's events read the price (T). */
  resolveAt?: bigint | number;
}) {
  const info = feed ? feedByAddress(feed) : undefined;
  const bond = info?.assetClass === "Bond";
  const { data: hist, isLoading } = useFeedRounds(feed, 400);
  const { data: latest } = useFeedLatest(feed);
  const now = useNow();

  // History + the freshest round (if it landed after the last history fetch).
  const rounds: Round[] = useMemo(() => {
    const r = [...(hist?.rounds ?? [])];
    if (latest && (!r.length || latest.updatedAt > r[r.length - 1].updatedAt)) r.push({ price: latest.price, updatedAt: latest.updatedAt });
    return r;
  }, [hist, latest]);

  const medianGap = useMemo(() => {
    const g = rounds.slice(1).map((x, i) => x.updatedAt - rounds[i].updatedAt).sort((a, b) => a - b);
    return g.length ? g[g.length >> 1] : 3600;
  }, [rounds]);
  const [interval, setInterval_] = useState<IntervalKey | null>(null);
  const iv: IntervalKey = interval ?? (medianGap > 6 * 3600 ? "1D" : "1H");
  const [type, setType] = useState<ChartType>("candles");
  const [ind, setInd] = useState<Record<Indicator, boolean>>({ sma: true, ema: false, bb: false, rsi: false, updates: true, levels: true });
  const toggle = (k: Indicator) => setInd((s) => ({ ...s, [k]: !s[k] }));

  const last = rounds[rounds.length - 1];
  const price = latest?.price ?? last?.price;
  const precision = pricePrecision(price ?? 100, bond);
  const candles = useMemo(() => toCandles(rounds, INTERVALS.find((x) => x.k === iv)!.s), [rounds, iv]);
  const day = priceAgo(rounds, 86_400);
  const ref24 = day ?? rounds[0]?.price;
  const chg = price !== undefined && ref24 ? price - ref24 : undefined;
  const chgPct = chg !== undefined && ref24 ? (chg / ref24) * 100 : undefined;
  const sinceUpdate = last ? Math.max(0, now - last.updatedAt) : undefined;

  // Flash the price when a new round lands.
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRound = useRef<string | undefined>(undefined);
  const prevPrice = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!latest) return;
    if (prevRound.current && prevRound.current !== latest.roundId && prevPrice.current !== undefined) {
      setFlash(latest.price >= prevPrice.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 1600);
      prevRound.current = latest.roundId;
      prevPrice.current = latest.price;
      return () => clearTimeout(t);
    }
    prevRound.current = latest.roundId;
    prevPrice.current = latest.price;
  }, [latest]);

  // --- chart ---------------------------------------------------------------
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: IChartApi; main: ISeriesApi<SeriesType>; extra: { key: string; s: ISeriesApi<SeriesType> }[] } | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const candleAt = useRef(new Map<number, Candle>());

  const dark = useIsDark();
  const th = dark
    ? { bg: "#15131b", text: "#aaa5b3", grid: "#221f29", border: "#2d2a35", ink: "#f3f1f8", label: "#2f2354" }
    : { bg: "#ffffff", text: "#52525b", grid: "#f4f4f5", border: "#e4e4e7", ink: INK, label: INK };

  const configKey = `${dark}|${type}|${precision}|${Object.entries(ind).map(([k, v]) => (v ? k : "")).join("")}|${thresholds.join(",")}`;

  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: th.bg }, textColor: th.text, fontSize: 11, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", panes: { separatorColor: th.grid } },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border, scaleMargins: { top: 0.12, bottom: ind.updates ? 0.22 : 0.08 } },
      timeScale: { borderColor: th.border, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 9 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#c4b5fd", width: 1, style: LineStyle.Dashed, labelBackgroundColor: th.label },
        horzLine: { color: "#c4b5fd", width: 1, style: LineStyle.Dashed, labelBackgroundColor: th.label },
      },
      localization: { priceFormatter: (p: number) => fmt(p, precision) },
    });
    const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
    const main: ISeriesApi<SeriesType> =
      type === "candles"
        ? chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat })
        : type === "line"
          ? chart.addSeries(LineSeries, { color: th.ink, lineWidth: 2, priceFormat, lastValueVisible: true })
          : chart.addSeries(AreaSeries, { lineColor: VIOLET, topColor: "rgba(124,58,237,0.22)", bottomColor: "rgba(124,58,237,0)", lineWidth: 2, priceFormat });
    const extra: { key: string; s: ISeriesApi<SeriesType> }[] = [];
    const line = (key: string, color: string, style = LineStyle.Solid, pane = 0, width: 1 | 2 = 1) =>
      extra.push({ key, s: chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat }, pane) });
    if (ind.sma) line("sma", VIOLET, LineStyle.Solid, 0, 2);
    if (ind.ema) line("ema", th.ink, LineStyle.Solid, 0, 1);
    if (ind.bb) {
      line("bbU", MUTED, LineStyle.Dotted);
      line("bbM", MUTED, LineStyle.Dashed);
      line("bbL", MUTED, LineStyle.Dotted);
    }
    if (ind.updates) {
      const s = chart.addSeries(HistogramSeries, { priceScaleId: "updates", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("updates").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      extra.push({ key: "updates", s });
    }
    if (ind.rsi) {
      const s = chart.addSeries(LineSeries, { color: VIOLET, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision: 1, minMove: 0.1 } }, 1);
      s.createPriceLine({ price: 70, color: th.border, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      s.createPriceLine({ price: 30, color: th.border, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      extra.push({ key: "rsi", s });
      chart.panes()[1]?.setHeight(90);
    }
    if (ind.levels) {
      for (const t of thresholds) main.createPriceLine({ price: t, color: VIOLET, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "level" });
    }
    chart.subscribeCrosshairMove((p) => {
      setHover(p.time !== undefined ? (candleAt.current.get(p.time as number) ?? null) : null);
    });
    api.current = { chart, main, extra };
    return () => {
      api.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- configKey captures every option that needs a rebuild
  }, [configKey]);

  const fitted = useRef<{ key: string; n: number }>({ key: "", n: 0 });
  useEffect(() => {
    const a = api.current;
    if (!a || !candles.length) return;
    candleAt.current = new Map(candles.map((c) => [c.time, c]));
    const T = (t: number) => t as UTCTimestamp as Time;
    // Keep the user's zoom/scroll across live updates; if they're looking at the
    // latest candle, stay pinned to it as new candles arrive.
    const n = candles.length;
    const prev = fitted.current;
    const sameView = prev.key === `${configKey}|${iv}` && prev.n > 5;
    let keep: LogicalRange | null = sameView ? a.chart.timeScale().getVisibleLogicalRange() : null;
    if (keep && keep.to >= prev.n - 2 && n !== prev.n) keep = { from: keep.from + (n - prev.n), to: keep.to + (n - prev.n) } as LogicalRange;
    if (type === "candles") a.main.setData(candles.map((c) => ({ time: T(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    else a.main.setData(candles.map((c) => ({ time: T(c.time), value: c.close })));
    const closes = candles.map((c) => c.close);
    const series = (vals: (number | undefined)[]) => candles.flatMap((c, i) => (vals[i] === undefined ? [] : [{ time: T(c.time), value: vals[i]! }]));
    const bb = bollinger(closes);
    for (const { key, s } of a.extra) {
      if (key === "sma") s.setData(series(sma(closes, 20)));
      if (key === "ema") s.setData(series(ema(closes, 50)));
      if (key === "bbU") s.setData(series(bb.map((b) => b?.upper)));
      if (key === "bbM") s.setData(series(bb.map((b) => b?.mid)));
      if (key === "bbL") s.setData(series(bb.map((b) => b?.lower)));
      if (key === "rsi") s.setData(series(rsi(closes)));
      if (key === "updates")
        s.setData(candles.map((c) => ({ time: T(c.time), value: c.rounds, color: c.close >= c.open ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)" })));
    }
    if (keep) a.chart.timeScale().setVisibleLogicalRange(keep);
    else a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, n - 72), to: n + 3 });
    fitted.current = { key: `${configKey}|${iv}`, n };
  }, [candles, configKey, iv, type]);

  if (!feed) return null;
  const shown = hover ?? candles[candles.length - 1];
  const up = (chg ?? 0) >= 0;
  const T = resolveAt !== undefined ? Number(resolveAt) : undefined;

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5">
      {/* header: live price */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-violet-500">
            <AssetIcon ticker={ticker} size={18} />
            {ticker} · Chainlink price feed (live)
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                "rounded-md px-1 text-2xl font-bold tabular-nums text-gray-900 transition-colors duration-700",
                flash === "up" && "bg-emerald-100 text-emerald-800",
                flash === "down" && "bg-rose-100 text-rose-800",
              )}
            >
              {price !== undefined ? `$${fmt(price, precision)}` : "…"}
            </span>
            {chg !== undefined && chgPct !== undefined && (
              <span className={cn("text-sm font-semibold tabular-nums", up ? "text-emerald-600" : "text-rose-600")}>
                {up ? "▲" : "▼"} {up ? "+" : "−"}
                {fmt(Math.abs(chg), precision)} ({up ? "+" : "−"}
                {Math.abs(chgPct).toFixed(2)}%)
                <span className="ml-1 font-normal text-gray-400">{day !== undefined ? "24h" : `${rounds.length} rounds`}</span>
              </span>
            )}
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-gray-500">
          <p className="flex items-center justify-end gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            polling every 10s · last round {sinceUpdate !== undefined ? `${ago(sinceUpdate)} ago` : "…"}
          </p>
          <a className="underline decoration-gray-300 hover:text-violet-700" href={`https://robinhoodchain.blockscout.com/address/${feed}`} target="_blank" rel="noreferrer">
            feed {feed.slice(0, 8)}… · round {latest?.roundId ? `#${(BigInt(latest.roundId) & ((1n << 64n) - 1n)).toString()}` : "…"}
          </a>
        </div>
      </div>

      {/* toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-gray-100 py-2">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {INTERVALS.map((x) => (
            <button
              key={x.k}
              type="button"
              onClick={() => setInterval_(x.k)}
              className={cn("rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold", iv === x.k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
            >
              {x.k}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {(["candles", "line", "area"] as ChartType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn("rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold capitalize", type === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />
        {(Object.keys(IND_LABEL) as Indicator[])
          .filter((k) => k !== "levels" || thresholds.length > 0)
          .map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={ind[k]}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[11px]",
                ind[k] ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-900",
              )}
            >
              {IND_LABEL[k]}
            </button>
          ))}
      </div>

      {/* chart + OHLC legend */}
      <div className="relative mt-3">
        {shown && (
          <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-white/85 px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
            <span className="font-semibold text-gray-900">
              {ticker} · {iv}
            </span>
            {(["open", "high", "low", "close"] as const).map((k) => (
              <span key={k} className="text-gray-500">
                {k[0].toUpperCase()} <span className={shown.close >= shown.open ? "text-emerald-700" : "text-rose-700"}>{fmt(shown[k], precision)}</span>
              </span>
            ))}
            <span className={shown.close >= shown.open ? "text-emerald-700" : "text-rose-700"}>
              {shown.close >= shown.open ? "+" : "−"}
              {fmt(Math.abs(shown.close - shown.open), precision)} ({shown.open ? (((shown.close - shown.open) / shown.open) * 100).toFixed(2) : "0.00"}%)
            </span>
            <span className="text-gray-400">
              {shown.rounds} round{shown.rounds === 1 ? "" : "s"} · {new Date(shown.time * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
        {isLoading && <div className="absolute inset-0 z-20 animate-pulse rounded-xl bg-gray-50" />}
        <div ref={box} className="w-full" style={{ height: ind.rsi ? 420 : 340 }} />
        {!isLoading && candles.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">No round history available.</p>}
      </div>

      {/* indicator key + how it's computed */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-gray-500">
        {ind.sma && <Key c={VIOLET} label="SMA 20" />}
        {ind.ema && <Key c={INK} label="EMA 50" />}
        {ind.bb && <Key c={MUTED} label="Bollinger 20 · 2σ" dashed />}
        {ind.levels && thresholds.length > 0 && <Key c={VIOLET} label={`market levels (${thresholds.map((t) => `$${fmt(t, precision)}`).join(" · ")})`} dashed />}
        {ind.updates && <Key c="rgba(22,163,74,0.5)" label="Updates = Chainlink rounds per candle" />}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        Each candle is built from real Chainlink rounds on Robinhood Chain mainnet: open = price in force when the interval began,
        high / low / close = the rounds inside it. Chainlink publishes a round when the price moves past its deviation threshold or a
        heartbeat expires (here, typically every {ago(medianGap)}), and stock feeds pause while US markets are closed, so a quiet
        chart means the price really did not move.
        {T !== undefined && (
          <>
            {" "}
            This market settles on the round in force at{" "}
            <span className="font-semibold text-gray-700">{new Date(T * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>.
          </>
        )}
      </p>
    </div>
  );
}

function Key({ c, label, dashed }: { c: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0 w-4 border-t-2" style={{ borderColor: c, borderStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </span>
  );
}
