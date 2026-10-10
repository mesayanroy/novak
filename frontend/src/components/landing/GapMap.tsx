"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createMap } from "svg-dotted-map";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { DottedMap, type Marker } from "@/registry/magicui/dotted-map";
import { cn } from "@/lib/utils";

/**
 * "The gap on Robinhood Chain", as a dotted world map: each hotspot is a fact a
 * stock-token protocol needs that the price feed doesn't give it, where that
 * fact originates, and the Novak event that closes the gap. Hover or tap a
 * point; with no interaction the points cycle slowly on their own.
 */

interface Gap {
  lat: number;
  lng: number;
  flag: string; // flagcdn country code
  place: string;
  label: string;
  gap: string;
  fix: string;
  source: string;
  href: string;
  /** Pill side, so neighbouring US labels don't collide. */
  side: "right" | "left";
}

const GAPS: Gap[] = [
  {
    lat: 40.7128,
    lng: -74.006,
    flag: "us",
    place: "New York · NYSE / Nasdaq",
    label: "Splits & dividends",
    gap: "Chainlink feeds carry no corporate-action calendar. A split shows up only as an ERC-8056 UIMultiplierUpdated log that every lending market must watch and handle itself.",
    fix: "rh.corporate-action.v1 resolves “did the multiplier change ≥ X in this window” once, from the token’s own logs.",
    source: "rh.corporate-action.v1",
    href: "/calendar",
    side: "right",
  },
  {
    lat: 37.4529,
    lng: -122.1817,
    flag: "us",
    place: "Menlo Park · Robinhood",
    label: "Trading halts",
    gap: "oraclePaused() is advisory and not enforced on-chain, and whether a token trades in the regular, extended or overnight session lives in Robinhood’s asset registry.",
    fix: "rh.trading-status.v1 turns “is TSLA halted overnight?” into a quorum-agreed, disputable on-chain fact.",
    source: "rh.trading-status.v1",
    href: "/guard",
    side: "left",
  },
  {
    lat: 38.627,
    lng: -90.1994,
    flag: "us",
    place: "St. Louis Fed · FRED",
    label: "Rate decisions",
    gap: "The Fed’s target range is published off-chain. A market on “will the Fed cut?” needs someone trusted to report it.",
    fix: "macro.fomc.v1 reads the FRED target-range series; resolvers must agree, anyone can dispute.",
    source: "macro.fomc.v1",
    href: "/feeds",
    side: "left",
  },
  {
    lat: 51.5072,
    lng: -0.1276,
    flag: "gb",
    place: "London · 24/7 holders",
    label: "Price at a time",
    gap: "Stock feeds pause outside US hours while tokens trade worldwide around the clock. “Where did NVDA close?” needs one agreed round, not whatever the feed shows later.",
    fix: "chainlink.price-at.v1 settles on the Chainlink round in force at T, with an evidence hash anyone can check.",
    source: "chainlink.price-at.v1",
    href: "/markets",
    side: "right",
  },
  {
    lat: 37.5665,
    lng: 126.978,
    flag: "kr",
    place: "Seoul · prediction markets",
    label: "Who decides disputes",
    gap: "When a fact is contested, optimistic oracles fall back to a token-holder vote, which can be bought, and it always picks an answer.",
    fix: "Bonded Tier-1 (≤7) and Tier-2 (≤15) committees need 66% agreement; no agreement means VOID and refunds.",
    source: "DisputeManager",
    href: "/disputes",
    side: "left",
  },
  {
    lat: 1.3521,
    lng: 103.8198,
    flag: "sg",
    place: "Singapore · structured products",
    label: "Combined conditions",
    gap: "“Fed cut BEFORE NVDA earnings” or “split AND above $X within 48h” means custom oracle glue in every protocol, each with its own answer.",
    fix: "EventComposer builds AND / OR / NOT / BEFORE / WITHIN on-chain with canonical IDs: one answer for everyone.",
    source: "EventComposer",
    href: "/docs/composition",
    side: "right",
  },
];

type GapMarker = Marker & { i: number };
const MARKERS: GapMarker[] = GAPS.map((g, i) => ({ lat: g.lat, lng: g.lng, size: 1.15, i }));
const W = 150;
const H = 75;

export function GapMap() {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  // Same projection the map uses, so the explainer can anchor to its hotspot.
  const pos = useMemo(() => {
    const placed = createMap({ width: W, height: H, mapSamples: 5000 }).addMarkers(MARKERS);
    return Object.fromEntries(placed.map((m) => [m.i, { x: m.x, y: m.y }])) as Record<number, { x: number; y: number }>;
  }, []);

  // Gentle auto-tour until someone interacts.
  useEffect(() => {
    if (hovering || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % GAPS.length), 4200);
    return () => clearInterval(t);
  }, [hovering, reduce]);

  const g = GAPS[active];
  const p = pos[active];

  return (
    <div className="relative" onMouseLeave={() => setHovering(false)}>
      <div className="relative mx-auto aspect-[2/1] w-full max-w-5xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(var(--c-paper))_92%)]" />
        <DottedMap<GapMarker>
          markers={MARKERS}
          dotColor="#cbbff3"
          markerColor="#7c3aed"
          dotRadius={0.3}
          renderMarkerOverlay={({ marker, x, y, index }) => {
            const gap = GAPS[marker.i];
            const on = marker.i === active;
            const fs = 1.85;
            const fr = on ? 1.75 : 1.45; // flag radius
            const pillH = 3.6;
            const pillW = gap.label.length * fs * 0.56 + fr * 2 + 2.6;
            const px = gap.side === "left" ? x - fr - 1.2 - pillW + fr * 2 : x - fr;
            const clip = `${id}-flag-${index}`;
            const pick = () => {
              setHovering(true);
              setActive(marker.i);
            };
            return (
              <g style={{ cursor: "pointer" }} onMouseEnter={pick} onClick={pick}>
                {on && !reduce && (
                  <circle cx={x} cy={y} r={2} fill="none" stroke="#7c3aed" strokeWidth={0.3}>
                    <animate attributeName="r" values="1.6;5.5" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* only the active point carries its label; the rest are flag pins */}
                {on && (
                  <g>
                    <rect x={px} y={y - pillH / 2} width={pillW} height={pillH} rx={pillH / 2} fill="#6d28d9" />
                    <text
                      x={gap.side === "left" ? px + 1.3 : x + fr + 1}
                      y={y + fs * 0.36}
                      fontSize={fs}
                      fontWeight={600}
                      fill="white"
                      fontFamily="ui-sans-serif, system-ui"
                    >
                      {gap.label}
                    </text>
                  </g>
                )}
                <circle cx={x} cy={y} r={fr + 0.35} fill="white" stroke={on ? "#6d28d9" : "#c4b5fd"} strokeWidth={0.35} />
                <clipPath id={clip}>
                  <circle cx={x} cy={y} r={fr} />
                </clipPath>
                <image
                  href={`https://flagcdn.com/w40/${gap.flag}.webp`}
                  x={x - fr}
                  y={y - fr}
                  width={fr * 2}
                  height={fr * 2}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clip})`}
                />
                {/* generous invisible hit area */}
                <circle cx={x} cy={y} r={4} fill="transparent" />
              </g>
            );
          }}
        />

        {/* floating explainer (md+) */}
        <AnimatePresence mode="wait">
          {p && (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto absolute z-10 hidden w-[320px] md:block"
              style={{
                left: `clamp(8px, calc(${(p.x / W) * 100}% - 160px), calc(100% - 328px))`,
                top: p.y / H > 0.55 ? undefined : `calc(${(p.y / H) * 100}% + 18px)`,
                bottom: p.y / H > 0.55 ? `calc(${(1 - p.y / H) * 100}% + 18px)` : undefined,
              }}
              onMouseEnter={() => setHovering(true)}
            >
              <GapCard g={g} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* phones: the explainer sits under the map */}
      <div className="mt-3 md:hidden">
        <GapCard g={g} />
      </div>

      {/* index of all gaps */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {GAPS.map((x, i) => (
          <button
            key={x.label}
            type="button"
            onMouseEnter={() => {
              setHovering(true);
              setActive(i);
            }}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              i === active ? "border-violet-600 bg-violet-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-violet-300 hover:text-violet-700",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GapCard({ g }: { g: Gap }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white/95 p-4 shadow-[0_24px_60px_-28px_rgba(76,29,149,0.55)] ring-1 ring-black/[0.02] backdrop-blur">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny remote flag */}
        <img src={`https://flagcdn.com/w40/${g.flag}.webp`} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-full object-cover ring-1 ring-black/10" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.place}</p>
      </div>
      <p className="mt-2 text-[15px] font-semibold text-ink">{g.label}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-600">
        <span className="font-semibold text-rose-700">The gap · </span>
        {g.gap}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-gray-700">
        <span className="font-semibold text-emerald-700">Novak · </span>
        {g.fix}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
        <span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">{g.source}</span>
        <Link href={g.href} className="link-plain inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900">
          See it live <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
