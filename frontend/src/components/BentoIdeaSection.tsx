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
    id: "EVT_BTC_100K",
    hash: "0x7f3a...b91c",
    title: "BTC > $100k",
    status: "FINALIZED",
    detail: "Resolved once at block #2194012. Standing reference for 14 active markets.",
  },
  {
    id: "EVT_FED_RATE_CUT",
    hash: "0x4e21...89fa",
    title: "Fed Rate Cut 25bps",
    status: "FINALIZED",
    detail: "FOMC statement verified via multi-oracle consensus. Zero dispute flags.",
  },
  {
    id: "EVT_ETH_STAKED_30M",
    hash: "0x9c00...55de",
    title: "ETH Staked > 30M",
    status: "VERIFIED",
    detail: "Beacon chain state snapshot locked at epoch #294000.",
  },
  {
    id: "EVT_BLOB_GAS_SPIKE",
    hash: "0x11ab...67cd",
    title: "Blob Gas > 500k",
    status: "FINALIZED",
    detail: "EIP-4844 telemetry trigger satisfied within 12h horizon.",
  },
  {
    id: "EVT_USDC_PEG_STABLE",
    hash: "0x88ff...0012",
    title: "USDC > $0.999",
    status: "VERIFIED",
    detail: "Chainlink + Uniswap TWAP dual-source verification passed.",
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
    time: "2m ago",
    badge: "PASSED",
  },
  {
    icon: Lock,
    title: "Challenger Bond Posted",
    description: "+10.0 ETH locked in DisputeManager vault #42",
    time: "5m ago",
    badge: "BONDED",
  },
  {
    icon: Cpu,
    title: "Safety Floor Enforced",
    description: "VOID state triggered — impossible condition averted",
    time: "12m ago",
    badge: "HARD FLOOR",
  },
  {
    icon: CheckCircle2,
    title: "Canonical Fact Stored",
    description: "Ready for standing reads by downstream markets",
    time: "18m ago",
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
          <span>Oracle A: BTC &gt; $100k</span>
        </div>
        <div
          ref={oracleBRef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <Database className="h-3.5 w-3.5 text-gray-600" />
          <span>Oracle B: Fed Cut</span>
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
          <span>Derivatives Market</span>
        </div>
        <div
          ref={vaultRef}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-paper px-3 py-1.5 text-xs font-mono text-ink shadow-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-gray-600" />
          <span>Insurance Vault</span>
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
              A composable event primitive for Ethereum
            </h2>
          </div>
          <p className="max-w-md text-xs text-gray-600 font-mono leading-relaxed">
            Instead of single-purpose oracle calls, Novak resolves facts once and exposes them as a standing, composable event topology.
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
