"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { DottedMap, type Marker } from "@/registry/magicui/dotted-map";
import { OrbitingCircles } from "@/registry/magicui/orbiting-circles";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { AssetIcon } from "@/components/markets/AssetIcon";
import { NovakLogo } from "@/components/NovakLogo";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-[0.8em] text-violet-700 ring-1 ring-violet-100">{children}</code>
);

interface Layer {
  title: string;
  where: string;
  body: ReactNode;
}

const LAYERS: Layer[] = [
  {
    title: "Sources, read-only",
    where: "Robinhood Chain mainnet · public APIs",
    body: (
      <>
        Chainlink stock &amp; SGOV feeds, ERC-8056 <Code>UIMultiplierUpdated</Code> logs, Robinhood&apos;s asset API and FRED.
        Novak never writes here — resolver adapters like <Code>chainlink.price-at.v1</Code> just read it.
      </>
    ),
  },
  {
    title: "Resolvers reach quorum",
    where: "EventRegistry.sol",
    body: (
      <>
        Each authorized resolver calls <Code>submitObservation(eventId, outcomeData, evidenceHash)</Code>. When{" "}
        <Code>quorumThreshold</Code> of them submit the <em>identical</em> payload, it becomes the proposed outcome and the
        dispute window starts.
      </>
    ),
  },
  {
    title: "Disputes go to committees",
    where: "DisputeManager.sol",
    body: (
      <>
        Anyone can <Code>dispute()</Code> by posting a bond. Tier 1 (≤7 resolvers) needs 66% of the committee; no decision
        escalates to Tier 2 (≤15); still none → <Code>Voided</Code> and markets refund. <strong>Never a token vote.</strong>
      </>
    ),
  },
  {
    title: "Finalized facts, composable",
    where: "EventBus.sol · EventComposer.sol",
    body: (
      <>
        Every consumer reads <Code>readOutcome()</Code> and <Code>getAvailability()</Code> — Pending, Available or Voided.
        Facts combine with AND / OR / NOT / BEFORE / WITHIN into new events with canonical IDs.
      </>
    ),
  },
  {
    title: "Markets settle on them",
    where: "DistributionMarket · Market · StockLendingGuard",
    body: (
      <>
        Range markets, yes/no markets and the lending guard read only through <Code>Settlement</Code>. Their fees flow to the{" "}
        <Code>TreasuryVault</Code>: ⅓ correct resolvers · ⅓ committee · ⅓ treasury.
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Right-hand visuals                                                  */
/* ------------------------------------------------------------------ */

type SourceMarker = Marker & { n?: number };

/** Where Novak's facts come from (numbered) and where 24/7 holders trade them (pulsing). */
const MARKERS: SourceMarker[] = [
  { lat: 40.7128, lng: -74.006, size: 0.9, n: 1 },
  { lat: 38.627, lng: -90.1994, size: 0.9, n: 2 },
  { lat: 37.4529, lng: -122.1817, size: 0.9, n: 3 },
  { lat: 51.5072, lng: -0.1276, size: 0.9, pulse: true },
  { lat: 37.5665, lng: 126.978, size: 0.9, pulse: true },
  { lat: 1.3521, lng: 103.8198, size: 0.9, pulse: true },
  { lat: -23.5505, lng: -46.6333, size: 0.9, pulse: true },
  { lat: 25.2048, lng: 55.2708, size: 0.9, pulse: true },
];

const SOURCES_LEGEND = [
  { n: 1, label: "Stock feeds", sub: "Chainlink" },
  { n: 2, label: "Fed rates", sub: "FRED" },
  { n: 3, label: "Robinhood", sub: "Asset API" },
];

export function SourcesMap({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-violet-200 bg-white p-4 shadow-[0_18px_50px_-28px_rgba(109,74,255,0.6)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-violet-700">01 · Sources → resolvers</p>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> mainnet · read-only
        </span>
      </div>
      <div className="relative mt-3 aspect-[2/1] w-full rounded-xl bg-violet-50/40 ring-1 ring-violet-100">
        <DottedMap<SourceMarker>
          markers={MARKERS}
          dotColor="#b9a8f0"
          markerColor="#7c3aed"
          dotRadius={0.34}
          renderMarkerOverlay={({ marker, x, y }) =>
            marker.n ? (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={x} cy={y} r={2.5} fill="#6d28d9" stroke="white" strokeWidth={0.6} />
                <text x={x} y={y + 0.95} textAnchor="middle" fontSize={2.7} fontWeight={700} fill="white" fontFamily="ui-monospace, monospace">
                  {marker.n}
                </text>
              </g>
            ) : null
          }
        />
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {SOURCES_LEGEND.map((l) => (
          <li key={l.n} className="flex min-w-0 items-start gap-2 rounded-xl border border-violet-100 bg-white px-2.5 py-2">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-violet-700 font-mono text-[10px] font-bold text-white">{l.n}</span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold leading-tight text-ink">{l.label}</span>
              <span className="block font-mono text-[10px] leading-tight text-gray-500">{l.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[12px] leading-snug text-gray-600">
        Facts originate in US markets and the Fed; tokenized stocks are held and traded <span className="font-semibold text-violet-700">24/7, worldwide</span>.
      </p>
    </div>
  );
}

export function AssetOrbit({ className, compact = false }: { className?: string; compact?: boolean }) {
  const outer = compact ? 108 : 132;
  const inner = compact ? 62 : 76;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-violet-200 bg-white p-4 shadow-[0_18px_50px_-28px_rgba(109,74,255,0.6)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-violet-700">02 · One fact, every market</p>
        <span className="font-mono text-[10px] text-gray-500">EventBus.readOutcome</span>
      </div>
      <div className="relative mx-auto flex items-center justify-center" style={{ height: outer * 2 + 56 }}>
        <div className="absolute h-28 w-28 rounded-full bg-violet-400/25 blur-2xl" />
        <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_0_40px_rgba(124,58,237,0.35)] ring-1 ring-violet-100">
          <NovakLogo className="h-9 w-9" />
        </div>
        <OrbitingCircles radius={outer} iconSize={compact ? 36 : 42} duration={26}>
          {["TSLA", "BTC", "SGOV", "NVDA"].map((t) => (
            <AssetIcon key={t} ticker={t} size={compact ? 36 : 42} round className="ring-2 ring-white" />
          ))}
        </OrbitingCircles>
        <OrbitingCircles radius={inner} iconSize={compact ? 26 : 30} reverse speed={1.6} pathClassName="stroke-violet-200/70">
          {["ETH", "EURC", "NVDA"].map((t, i) => (
            <AssetIcon key={`${t}${i}`} ticker={t} size={compact ? 26 : 30} round className="ring-2 ring-white" />
          ))}
        </OrbitingCircles>
      </div>
      <p className="-mt-2 text-xs text-gray-500">
        A finalized fact is stored <span className="font-semibold text-violet-700">once</span> and read by every range market,
        yes/no market and lending guard.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop: pinned, scroll-driven semicircles                          */
/* ------------------------------------------------------------------ */

/** Round to 2 dp so server- and client-rendered transforms match exactly (no hydration mismatch). */
const r2 = (v: number) => Math.round(v * 100) / 100;

const STEP_DEG = 24; // spacing of the layer nodes along the left arc
const PANEL_SPAN = 74; // spacing of the two frames along the right arc

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const w = useMotionValue(1200);
  const h = useMotionValue(720);
  const [size, setSize] = useState({ w: 1200, h: 720 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      w.set(r.width);
      h.set(r.height);
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return { ref, w, h, size };
}

/** Left arc geometry: circle centred off-screen left; its right-most point is the focus. */
const leftArc = (w: number, h: number) => {
  const R = Math.min(h * 0.46, 380);
  const focusX = Math.min(150, w * 0.12);
  return { R, cx: focusX - R, cy: h / 2, focusX };
};
/** Right arc: mirror of the left. Circle centred off-screen right; its left-most
 *  point is the focus; the frame sits just right of its node, like the left card. */
const rightArc = (w: number, h: number) => {
  const panelW = Math.min(430, w * 0.37);
  const R = Math.min(h * 0.46, 380);
  const focusX = w - panelW - 52;
  return { R, cx: focusX + R, cy: h / 2, panelW, focusX };
};

function ArcNode({ i, p, w, h, active, onPick }: { i: number; p: MotionValue<number>; w: MotionValue<number>; h: MotionValue<number>; active: boolean; onPick: () => void }) {
  const N = LAYERS.length;
  const theta = useTransform(p, (v) => (i - v * (N - 1)) * STEP_DEG);
  const x = useTransform([theta, w, h] as MotionValue<number>[], ([t, ww, hh]: number[]) => {
    const a = leftArc(ww, hh);
    return r2(a.cx + a.R * Math.cos((t * Math.PI) / 180));
  });
  const y = useTransform([theta, w, h] as MotionValue<number>[], ([t, ww, hh]: number[]) => {
    const a = leftArc(ww, hh);
    return r2(a.cy + a.R * Math.sin((t * Math.PI) / 180));
  });
  const opacity = useTransform(theta, (t) => r2(Math.max(0.12, 1 - Math.abs(t) / (STEP_DEG * 2.7))));
  const scale = useTransform(theta, (t) => r2(1 + Math.max(0, 1 - Math.abs(t) / STEP_DEG) * 0.25));
  // Labels show only for the immediate neighbours: hidden near the focus (where
  // the detail card sits) and beyond one step (where faded nodes bunch up).
  const labelOpacity = useTransform(theta, (t) => {
    const a = Math.abs(t) / STEP_DEG;
    const rise = Math.min(1, Math.max(0, (a - 0.5) / 0.35));
    const fall = Math.min(1, Math.max(0, 1 - (a - 1.1) / 0.6));
    return r2(rise * fall);
  });
  return (
    <motion.button
      type="button"
      onClick={onPick}
      style={{ x, y, opacity, scale }}
      className="absolute left-0 top-0 -ml-5 -mt-5 flex items-center gap-3"
      aria-label={`Layer ${i + 1}: ${LAYERS[i].title}`}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white font-mono text-sm font-bold shadow-lg transition-colors",
          active ? "bg-violet-600 text-white shadow-violet-500/40" : "bg-white text-violet-600 ring-1 ring-violet-200",
        )}
      >
        {i + 1}
      </span>
      {!active && (
        <motion.span style={{ opacity: labelOpacity }} className="whitespace-nowrap text-sm font-medium text-gray-500">
          {LAYERS[i].title}
        </motion.span>
      )}
    </motion.button>
  );
}

function ArcPanel({ i, p, w, h, width, children }: { i: number; p: MotionValue<number>; w: MotionValue<number>; h: MotionValue<number>; width: number; children: ReactNode }) {
  // Scrolling down moves both frames UP the arc (matching the left side): the
  // map leaves over the top while the orbit rises from below.
  const drift = useTransform(p, [0, 0.42, 0.58, 1], [-6, 0, PANEL_SPAN, PANEL_SPAN + 6]);
  const phi = useTransform(drift, (d) => 180 - i * PANEL_SPAN + d);
  const x = useTransform([phi, w, h] as MotionValue<number>[], ([f, ww, hh]: number[]) => {
    const a = rightArc(ww, hh);
    return r2(a.cx + a.R * Math.cos((f * Math.PI) / 180));
  });
  const y = useTransform([phi, w, h] as MotionValue<number>[], ([f, ww, hh]: number[]) => {
    const a = rightArc(ww, hh);
    return r2(a.cy + a.R * Math.sin((f * Math.PI) / 180));
  });
  const opacity = useTransform(phi, (f) => r2(Math.max(0, 1 - Math.abs(f - 180) / 46)));
  const nodeScale = useTransform(phi, (f) => r2(1 + Math.max(0, 1 - Math.abs(f - 180) / 20) * 0.25));
  const [focused, setFocused] = useState(i === 0);
  useMotionValueEvent(phi, "change", (f) => setFocused(Math.abs(f - 180) < 30));
  return (
    // outer: rides the arc (framer owns its transform); node on the arc, frame beside it
    <motion.div style={{ x, y, opacity }} className="absolute left-0 top-0 h-0 w-0">
      <motion.span
        style={{ scale: nodeScale }}
        className={cn(
          "absolute -left-5 -top-5 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white font-mono text-[11px] font-bold shadow-lg transition-colors",
          focused ? "bg-violet-600 text-white shadow-violet-500/40" : "bg-white text-violet-600 ring-1 ring-violet-200",
        )}
      >
        {String(i + 1).padStart(2, "0")}
      </motion.span>
      <span className="absolute left-6 top-0 h-px w-5 bg-violet-300" />
      <div className="absolute left-12 top-0 -translate-y-1/2" style={{ width }}>
        {children}
      </div>
    </motion.div>
  );
}

function DesktopScroll() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { ref: stageRef, w, h, size } = useSize<HTMLDivElement>();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.6 });
  const N = LAYERS.length;
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);
  useMotionValueEvent(p, "change", (v) => {
    const next = Math.min(N - 1, Math.max(0, Math.round(v * (N - 1))));
    setActive((prev) => {
      if (next !== prev) setDir(next > prev ? 1 : -1);
      return next;
    });
  });

  const L = leftArc(size.w, size.h);
  const Rr = rightArc(size.w, size.h);
  const cardLeft = L.focusX + 48;
  const cardWidth = Math.max(300, Math.min(420, Rr.focusX - 64 - cardLeft));

  const jump = (i: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (span * i) / (N - 1), behavior: "smooth" });
  };

  return (
    <div ref={sectionRef} className="relative mt-6 hidden lg:block" style={{ height: `${100 + (N - 1) * 62}vh` }}>
      <div className="sticky top-16 h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden">
        <div ref={stageRef} className="relative mx-auto h-full max-w-6xl">
          {/* the two semicircle tracks */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="arcfade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0" />
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx={L.cx} cy={L.cy} r={L.R} fill="none" stroke="url(#arcfade)" strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" />
            <circle cx={L.cx} cy={L.cy} r={L.R - 26} fill="none" stroke="#ede9fe" strokeWidth={1} />
            <circle cx={Rr.cx} cy={Rr.cy} r={Rr.R} fill="none" stroke="url(#arcfade)" strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" />
            <circle cx={Rr.cx} cy={Rr.cy} r={Rr.R - 26} fill="none" stroke="#ede9fe" strokeWidth={1} />
            <line x1={L.focusX + 24} x2={cardLeft - 8} y1={L.cy} y2={L.cy} stroke="#c4b5fd" strokeWidth={1.5} strokeDasharray="3 4" />
          </svg>

          {/* left: layer nodes riding the arc */}
          {LAYERS.map((_, i) => (
            <ArcNode key={i} i={i} p={p} w={w} h={h} active={i === active} onPick={() => jump(i)} />
          ))}

          {/* left: details of the active layer, entering along the scroll direction */}
          <div className="absolute" style={{ left: cardLeft, top: L.cy, width: cardWidth, transform: "translateY(-50%)" }}>
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={active}
                custom={dir}
                initial={{ opacity: 0, y: dir * 46, rotate: dir * 3, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -dir * 46, rotate: -dir * 3, filter: "blur(4px)" }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="origin-left rounded-2xl border border-violet-100 bg-white/95 p-5 shadow-[0_18px_50px_-28px_rgba(109,74,255,0.6)] backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 font-mono text-sm font-bold text-white shadow-md shadow-violet-500/30">
                    {active + 1}
                  </span>
                  <div>
                    <p className="text-lg font-semibold leading-tight text-ink">{LAYERS[active].title}</p>
                    <p className="font-mono text-[11px] text-violet-600">{LAYERS[active].where}</p>
                  </div>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-700">{LAYERS[active].body}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* right: the two frames riding the mirrored arc */}
          <ArcPanel i={0} p={p} w={w} h={h} width={Rr.panelW}>
            <SourcesMap />
          </ArcPanel>
          <ArcPanel i={1} p={p} w={w} h={h} width={Rr.panelW}>
            <AssetOrbit />
          </ArcPanel>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phones / tablets: stacked timeline with the frames in between       */
/* ------------------------------------------------------------------ */

function MobileStack({ always = false }: { always?: boolean }) {
  const item = (i: number) => (
    <motion.li
      key={i}
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative pb-8 pl-12 last:pb-0"
    >
      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-violet-600 font-mono text-xs font-bold text-white shadow-md shadow-violet-500/30">
        {i + 1}
      </span>
      <p className="font-semibold text-ink">{LAYERS[i].title}</p>
      <p className="font-mono text-[10px] text-violet-600">{LAYERS[i].where}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{LAYERS[i].body}</p>
    </motion.li>
  );
  const frame = (node: ReactNode) => (
    <motion.div initial={{ opacity: 0, y: 30, rotate: 2 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.55 }} className="mb-8">
      {node}
    </motion.div>
  );
  return (
    <div className={always ? "" : "lg:hidden"}>
      <ol className="relative ml-4 border-l-2 border-violet-100 pl-0 [&>li]:-ml-4">
        {item(0)}
        {item(1)}
      </ol>
      <div className="mt-8">{frame(<SourcesMap />)}</div>
      <ol className="relative ml-4 border-l-2 border-violet-100 [&>li]:-ml-4">
        {item(2)}
        {item(3)}
        {item(4)}
      </ol>
      <div className="mt-8">{frame(<AssetOrbit compact />)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ArchitectureScroll() {
  // Applied after mount: the server can't know the visitor's motion preference,
  // so the first client render must match the server's (no hydration mismatch).
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduceMotion = mounted && Boolean(prefersReduced);
  const header = useMemo(
    () => (
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Architecture</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-4xl">Five layers, one strict dependency rule</h2>
          <p className="mt-2 max-w-xl text-gray-600">
            Each layer talks only to the one beneath it. Scroll to walk a fact from a <span className="font-semibold text-violet-700">Chainlink round</span> to a{" "}
            <span className="font-semibold text-violet-700">settled market</span>.
          </p>
        </div>
        <a href="/docs/architecture" className="link-plain border-b border-ink pb-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink hover:text-violet-700">
          Read full spec →
        </a>
      </div>
    ),
    [],
  );

  return (
    <section className="relative border-y border-gray-200 bg-gradient-to-b from-white via-violet-50/30 to-white pt-16">
      <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,white,transparent)]" />
      {header}
      <div className="relative">
        {/* Reduced motion: no pinned scroll-jacking, just the stacked layout everywhere. */}
        {!reduceMotion && <DesktopScroll />}
        <div className={cn("mx-auto max-w-xl px-6 pb-16 pt-10", !reduceMotion && "lg:hidden")}>
          <MobileStack always={Boolean(reduceMotion)} />
        </div>
      </div>
    </section>
  );
}
