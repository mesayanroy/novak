"use client";

import React, { useRef } from "react";
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Marquee } from "@/components/ui/marquee";
import { AnimatedList } from "@/components/ui/animated-list";
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

// --- Demo 2: Dispute Telemetry Animated List ---
const telemetryNotifications = [
  {
    icon: ShieldCheck,
    title: "Tier-1 Committee Quorum Reached",
    description: "66% consensus achieved on Event EVT_0x7f3a",
    time: "step 4",
    badge: "PASSED",
  },
  {
    icon: Lock,
    title: "Challenger Bond Posted",
    description: "0.01 ETH dispute bond posted — a Tier-1 committee is drawn",
    time: "step 3",
    badge: "BONDED",
  },
  {
    icon: Cpu,
    title: "Safety Floor Enforced",
    description: "Never converged → VOIDED; dependent markets switch to refunds",
    time: "step 5",
    badge: "HARD FLOOR",
  },
  {
    icon: CheckCircle2,
    title: "Canonical Fact Stored",
    description: "Readable by every market and lending guard via EventBus",
    time: "step 6",
    badge: "FINALIZED",
  },
];

function DisputeTelemetryList({ className }: { className?: string }) {
  return (
    <div className={cn("absolute top-3 right-3 w-[88%] sm:w-[340px]", className)}>
      <AnimatedList delay={2000}>
        {telemetryNotifications.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-md border border-gray-300 bg-paper p-2.5 shadow-2xs font-mono text-xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-gray-50 text-ink">
                <item.icon className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-sans font-semibold text-ink text-xs">
                  <span>{item.title}</span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">{item.description}</div>
              </div>
            </div>
            <span className="text-[9px] font-bold text-ink border border-gray-200 bg-gray-100 px-1.5 py-0.5 rounded">
              {item.badge}
            </span>
          </div>
        ))}
      </AnimatedList>
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
      "Events are finalized and stored once in Novak's EventBus — providing a permanent on-chain reference for endless downstream applications.",
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
      "Precision time-bound event evaluations locked to epoch windows and verification horizons.",
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
              The Idea • Bento Architecture
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
