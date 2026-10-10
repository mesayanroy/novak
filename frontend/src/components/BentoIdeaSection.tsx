"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  Bell,
  Share2,
  Calendar as CalendarIcon,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Cpu,
  ArrowUpRight,
  Database,
  Lock,
  Gavel,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Marquee } from "@/components/ui/marquee";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { Calendar } from "@/components/ui/calendar";

// --- Demo 1: Canonical Events Marquee ---
const canonicalEvents = [
  {
    id: "NVDA_MULTIPLIER",
    hash: "rh.corporate-action.v1",
    title: "NVDA multiplier +0.0775%",
    status: "FINALIZED",
    detail: "ERC-8056 update effective Sep 10 2026 — detected by resolvers from the token's own logs.",
  },
  {
    id: "NVDA_GTE_224",
    hash: "chainlink.price-at.v1",
    title: "NVDA ≥ $224 at T",
    status: "FINALIZED",
    detail: "Chainlink Robinhood NVDA/USD round in effect at T, read on Robinhood Chain.",
  },
  {
    id: "TSLA_OVERNIGHT",
    hash: "rh.trading-status.v1",
    title: "TSLA not tradable overnight",
    status: "OPEN",
    detail: "Snapshot of Robinhood's asset registry, agreed by a resolver quorum.",
  },
  {
    id: "AAPL_SPLIT",
    hash: "rh.corporate-action.v1",
    title: "AAPL split-size action",
    status: "OPEN",
    detail: "minChangeBps ≥ 5000 separates real splits from dividend reinvestment.",
  },
  {
    id: "FED_BEFORE_EARNINGS",
    hash: "composite · BEFORE",
    title: "Fed cut BEFORE NVDA earnings",
    status: "COMPOSED",
    detail: "Two facts, one canonical ID — every market composing them reads the same answer.",
  },
];

function CanonicalEventsMarquee() {
  return (
    <Marquee
      pauseOnHover
      className="absolute top-6 w-full [mask-image:linear-gradient(to_top,transparent_20%,#000_100%)] [--duration:25s]"
    >
      {canonicalEvents.map((evt, idx) => (
        <figure
          key={idx}
          className={cn(
            "relative w-48 cursor-pointer overflow-hidden rounded-md border p-3 font-mono text-xs transition-all duration-300 ease-out",
            "border-gray-300 bg-paper hover:border-ink hover:shadow-sm"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-ink text-[11px]">{evt.id}</span>
            <span className="rounded bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-paper">
              {evt.status}
            </span>
          </div>
          <div className="mt-1.5 text-xs font-sans font-semibold text-ink">
            {evt.title}
          </div>
          <div className="mt-1 text-[10px] text-gray-400">{evt.hash}</div>
          <p className="mt-2 text-[10px] font-sans text-gray-600 line-clamp-2 leading-tight">
            {evt.detail}
          </p>
        </figure>
      ))}
    </Marquee>
  );
}

// --- Demo 2: Dispute telemetry, as a live notification stream ---
// The real order of a contested event, looping: each step arrives on top like a
// phone notification, older ones slide down and fade out.
const telemetryNotifications = [
  { icon: Gavel, tone: "bg-violet-600", title: "Outcome proposed", description: "2/2 resolvers agree · NVDA ≥ $230 at T → YES", badge: "QUORUM" },
  { icon: Lock, tone: "bg-amber-500", title: "Challenger bond posted", description: "0.0005 ETH bond — a Tier-1 committee is drawn", badge: "BONDED" },
  { icon: Users, tone: "bg-sky-600", title: "Committee drawn by commit-reveal", description: "7 bonded resolvers · seed = XOR of revealed salts", badge: "TIER 1" },
  { icon: ShieldCheck, tone: "bg-emerald-600", title: "Tier-1 quorum reached", description: "5 of 7 voted YES — 66% of the committee", badge: "PASSED" },
  { icon: CheckCircle2, tone: "bg-gray-900", title: "Canonical fact stored", description: "Readable by every market and lending guard via EventBus", badge: "FINALIZED" },
  { icon: Cpu, tone: "bg-rose-600", title: "Safety floor enforced", description: "Another event never converged → VOIDED; markets refund", badge: "HARD FLOOR" },
];

function DisputeTelemetryList({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(2);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  const N = telemetryNotifications.length;
  // newest first; keep the last three on screen
  const shown = [0, 1, 2].map((k) => ({ id: tick - k, item: telemetryNotifications[(((tick - k) % N) + N) % N] }));

  return (
    <div
      className={cn(
        "absolute right-3 top-3 w-[92%] sm:w-[360px] [mask-image:linear-gradient(to_bottom,#000_62%,transparent_100%)]",
        className,
      )}
    >
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map(({ id, item }, i) => (
            <motion.li
              key={id}
              layout
              initial={{ opacity: 0, y: -28, scale: 0.94 }}
              animate={{ opacity: i === 2 ? 0.55 : 1, y: 0, scale: i === 0 ? 1 : 0.98 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/90 p-2.5 shadow-[0_10px_30px_-18px_rgba(76,29,149,0.55)] ring-1 ring-violet-100/80 backdrop-blur"
            >
              <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-xl text-white shadow-sm", item.tone)}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink">{item.title}</span>
                  <span className="flex-none font-mono text-[10px] text-gray-400">{i === 0 ? "now" : `${i * 2}s ago`}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10.5px] text-gray-500">{item.description}</span>
                  <span className="flex-none rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-violet-700 ring-1 ring-violet-100">
                    {item.badge}
                  </span>
                </span>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// --- Demo 3: Neural Topology Beam ---
function TopologyBeamDemo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const oracleARef = useRef<HTMLDivElement>(null);
  const oracleBRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const marketRef = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[190px] w-full items-center justify-between px-6 pt-4",
        className
      )}
    >
      {/* Input Oracles Layer */}
      <div className="flex flex-col justify-between gap-6 z-10">
        <div
          ref={oracleARef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <Database className="h-3.5 w-3.5 text-gray-600" />
          <span>Chainlink: NVDA ≥ $224</span>
        </div>
        <div
          ref={oracleBRef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <Database className="h-3.5 w-3.5 text-gray-600" />
          <span>ERC-8056: NVDA split</span>
        </div>
      </div>

      {/* Central Composition Node */}
      <div className="z-10">
        <div
          ref={composerRef}
          className="flex flex-col items-center justify-center rounded-md border-2 border-ink bg-paper p-3 text-center shadow-md"
        >
          <Layers className="h-5 w-5 text-ink mb-1" />
          <span className="text-xs font-bold text-ink font-mono">WITHIN (48h)</span>
          <span className="text-[9px] text-gray-500 font-mono">EventComposer</span>
        </div>
      </div>

      {/* Output Consumers Layer */}
      <div className="flex flex-col justify-between gap-6 z-10">
        <div
          ref={marketRef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <ArrowUpRight className="h-3.5 w-3.5 text-gray-600" />
          <span>Event Market</span>
        </div>
        <div
          ref={vaultRef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-gray-600" />
          <span>Lending Guard</span>
        </div>
      </div>

      {/* Beams */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={oracleARef}
        toRef={composerRef}
        curvature={-20}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={oracleBRef}
        toRef={composerRef}
        curvature={20}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={composerRef}
        toRef={marketRef}
        curvature={-20}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={composerRef}
        toRef={vaultRef}
        curvature={20}
      />
    </div>
  );
}

// --- Main Bento Section Features ---
const features = [
  {
    Icon: FileText,
    name: "Canonical Standing Facts",
    description:
      "Finalized once in the EventBus, then read by every downstream app as a permanent on-chain reference.",
    href: "/docs/architecture",
    cta: "Explore event store",
    className: "col-span-3 lg:col-span-1",
    background: <CanonicalEventsMarquee />,
  },
  {
    Icon: Bell,
    name: "Two-Tier Dispute Telemetry",
    description:
      "Economic dispute ladder with real-time bond tracking, committee voting quorum, and automated VOID safety hard floors.",
    href: "/docs/disputes",
    cta: "View dispute spec",
    className: "col-span-3 lg:col-span-2",
    background: <DisputeTelemetryList />,
  },
  {
    Icon: Share2,
    name: "Neural Topology & Composition",
    description:
      "Combine primitive facts using AND, OR, NOT, and WITHIN temporal windows without writing custom oracle glue code.",
    href: "/docs/composition",
    cta: "See operator matrix",
    className: "col-span-3 lg:col-span-2",
    background: <TopologyBeamDemo />,
  },
  {
    Icon: CalendarIcon,
    name: "Temporal Horizon Window",
    description:
      "Every event is evaluated at a fixed time T, inside a set observation and dispute window.",
    href: "/docs/lifecycle",
    cta: "View lifecycle",
    className: "col-span-3 lg:col-span-1",
    background: (
      <div className="absolute top-4 right-4 flex justify-center [mask-image:linear-gradient(to_top,transparent_10%,#000_100%)]">
        <Calendar className="scale-90 origin-top-right transition-transform duration-300 group-hover:scale-95" />
      </div>
    ),
  },
];

export function BentoIdeaSection() {
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse-subtle" />
              The Idea
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
              A composable event primitive for Robinhood Chain
            </h2>
          </div>
          <p className="max-w-md text-xs text-gray-600 font-mono leading-relaxed">
            Chainlink gives Robinhood Chain prices. Novak resolves the facts around them — corporate actions, halts, price-at-time conditions — once, and exposes them as standing, composable events.
          </p>
        </div>

        <BentoGrid>
          {features.map((feature, idx) => (
            <BentoCard key={idx} {...feature} />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}
