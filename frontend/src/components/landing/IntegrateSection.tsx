"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, BarChart3, Check, Cpu, Landmark, Minus, Scale, ShieldCheck, Store, Users, Wallet, X } from "lucide-react";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/registry/magicui/terminal";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { AssetIcon } from "@/components/markets/AssetIcon";
import { NovakLogo } from "@/components/NovakLogo";
import { cn } from "@/lib/utils";

const Hl = ({ children }: { children: ReactNode }) => <span className="rounded-md bg-violet-100/70 px-1 font-semibold text-violet-800">{children}</span>;

/* ------------------------------------------------------------------ */
/* 1 · Why it matters — composable facts + the SDK terminal            */
/* ------------------------------------------------------------------ */

function SdkTerminal() {
  return (
    <Terminal title="your-amm/settle.ts — @novak/sdk" className="shadow-[0_24px_70px_-36px_rgba(109,74,255,0.65)]">
      <TypingAnimation className="text-gray-500">$ pnpm --filter @novak/sdk build</TypingAnimation>
      <AnimatedSpan className="text-emerald-600">✔ @novak/sdk ready · generated ABIs + Robinhood Chain testnet addresses</AnimatedSpan>
      <TypingAnimation className="text-ink">{"> const novak = new NovakClient(publicClient, wallet, getDeployment(46630))"}</TypingAnimation>
      <AnimatedSpan className="text-emerald-600">✔ EventBus 0xab30…1054 · chain 46630</AnimatedSpan>
      <TypingAnimation className="text-ink">{"> await novak.createEvents(buildPriceLadderSpecs({ feed: NVDA, thresholds, at }), me)"}</TypingAnimation>
      <AnimatedSpan className="text-emerald-600">✔ 5 boundary events · quorum 2 · dispute window 10 min</AnimatedSpan>
      <TypingAnimation className="text-ink">{"> const r = await novak.waitForOutcome(eventId)"}</TypingAnimation>
      <AnimatedSpan className="text-gray-500">… resolvers observe the Chainlink round at T · quorum · window closes</AnimatedSpan>
      <AnimatedSpan className="text-emerald-600">✔ Finalized · outcome TRUE</AnimatedSpan>
      <TypingAnimation className="text-ink">{"> r.voided ? amm.refundAll(id) : amm.settle(id, r.outcome)"}</TypingAnimation>
      <AnimatedSpan className="text-emerald-600">✔ AMM settled · winners paid</AnimatedSpan>
      <AnimatedSpan className="text-violet-600">ℹ fees → TreasuryVault · ⅓ resolvers · ⅓ committee · ⅓ treasury</AnimatedSpan>
      <TypingAnimation className="text-gray-500">Your market now has a dispute layer.</TypingAnimation>
    </Terminal>
  );
}

function WhyItMatters() {
  return (
    <section className="relative overflow-hidden border-t border-gray-200 bg-gray-50 py-20">
      <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.5 }}>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Why it matters</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Composable facts, not one-off integrations</h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-700">
            One NVDA fact, <Hl>finalized once</Hl>, is read by a market that settles on it and a lending guard that pauses
            liquidations — neither runs its own oracle. Rules like &ldquo;NVDA above $X <Hl>AND</Hl> a split this week&rdquo; are
            events too, with <Hl>canonical IDs</Hl> the next protocol simply reuses.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
            Any prediction market or AMM plugs in with a few SDK calls — or one <code className="rounded bg-violet-50 px-1 font-mono text-[0.85em] text-violet-700">IEventBus</code>{" "}
            read on-chain — and inherits quorum, bonded committees and the <Hl>VOID</Hl> refund path.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs/integrate" className="link-plain inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              Integration guide <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/docs/sdk" className="link-plain inline-flex items-center rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:border-violet-400">
              SDK reference
            </Link>
          </div>
        </motion.div>
        <div className="min-w-0">
          <SdkTerminal />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Plug any market in — beams into the EventBus                     */
/* ------------------------------------------------------------------ */

const Node = forwardRef<HTMLDivElement, { children: ReactNode; label: string; className?: string }>(({ children, label, className }, ref) => (
  <div className="flex flex-col items-center gap-1.5">
    <div ref={ref} className={cn("z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_-12px_rgba(109,74,255,0.5)]", className)}>
      {children}
    </div>
    <span className="max-w-[90px] text-center text-[11px] font-medium leading-tight text-gray-600">{label}</span>
  </div>
));
Node.displayName = "Node";

function PlugHub() {
  const box = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const res = useRef<HTMLDivElement>(null);
  const com = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const amm = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLDivElement>(null);
  const lend = useRef<HTMLDivElement>(null);
  const yours = useRef<HTMLDivElement>(null);
  const beam = { containerRef: box, pathColor: "#c4b5fd", pathOpacity: 0.5, gradientStartColor: "#7c3aed", gradientStopColor: "#c084fc", pathWidth: 2 };

  return (
    <div ref={box} className="relative mx-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-3xl border border-violet-100 bg-white/70 px-4 py-8 sm:px-10">
      <div className="flex flex-col gap-6">
        <Node ref={feed} label="Chainlink rounds">
          <AssetIcon ticker="NVDA" size={34} />
        </Node>
        <Node ref={res} label="Resolver quorum">
          <Cpu className="h-6 w-6 text-violet-600" />
        </Node>
        <Node ref={com} label="Committees">
          <Scale className="h-6 w-6 text-violet-600" />
        </Node>
      </div>
      <Node ref={hub} label="EventBus" className="h-20 w-20 rounded-3xl border-violet-200 shadow-[0_0_50px_rgba(124,58,237,0.35)]">
        <NovakLogo className="h-11 w-11" />
      </Node>
      <div className="flex flex-col gap-4">
        <Node ref={amm} label="Polymarket-style AMM">
          <Store className="h-6 w-6 text-violet-600" />
        </Node>
        <Node ref={range} label="Range market">
          <BarChart3 className="h-6 w-6 text-violet-600" />
        </Node>
        <Node ref={lend} label="Lending guard">
          <ShieldCheck className="h-6 w-6 text-violet-600" />
        </Node>
        <Node ref={yours} label="Your contract">
          <Wallet className="h-6 w-6 text-violet-600" />
        </Node>
      </div>
      <AnimatedBeam {...beam} fromRef={feed} toRef={hub} curvature={-40} duration={5} />
      <AnimatedBeam {...beam} fromRef={res} toRef={hub} duration={5} delay={0.4} />
      <AnimatedBeam {...beam} fromRef={com} toRef={hub} curvature={40} duration={5} delay={0.8} />
      <AnimatedBeam {...beam} fromRef={hub} toRef={amm} curvature={-50} duration={4} delay={0.2} />
      <AnimatedBeam {...beam} fromRef={hub} toRef={range} curvature={-15} duration={4} delay={0.6} />
      <AnimatedBeam {...beam} fromRef={hub} toRef={lend} curvature={15} duration={4} delay={1} />
      <AnimatedBeam {...beam} fromRef={hub} toRef={yours} curvature={50} duration={4} delay={1.4} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · The dispute race — token vote vs Novak                          */
/* ------------------------------------------------------------------ */

const TOKEN_LANE = [
  { t: "One proposer answers", d: "a single bonded proposal" },
  { t: "Someone disputes", d: "bond posted" },
  { t: "Escalates to a token vote", d: "weighted by governance-token holdings" },
  { t: "The vote picks an answer", d: "even when the facts are contested", bad: true },
];
const NOVAK_LANE = [
  { t: "Quorum of resolvers", d: "identical answers + evidence hashes" },
  { t: "Someone disputes", d: "0.01 ETH bond" },
  { t: "Tier 1 committee", d: "≤7 resolvers re-check the source · 66%" },
  { t: "Tier 2 committee", d: "≤15 resolvers if Tier 1 can't agree" },
  { t: "Finalized — or VOID", d: "no agreement → markets refund, never a guess", good: true },
];

function Lane({ title, steps, lit, tone }: { title: string; steps: { t: string; d: string; bad?: boolean; good?: boolean }[]; lit: number; tone: "gray" | "violet" }) {
  return (
    <div className={cn("rounded-3xl border p-5", tone === "violet" ? "border-violet-200 bg-gradient-to-b from-violet-50 to-white" : "border-gray-200 bg-white")}>
      <p className={cn("font-mono text-[11px] font-semibold uppercase tracking-wide", tone === "violet" ? "text-violet-700" : "text-gray-500")}>{title}</p>
      <ol className="relative mt-4 space-y-3">
        {steps.map((s, i) => {
          const on = i < lit;
          return (
            <motion.li
              key={s.t}
              animate={{ opacity: on ? 1 : 0.35, x: on ? 0 : -6 }}
              transition={{ duration: 0.35 }}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                on && s.bad && "border-rose-200 bg-rose-50",
                on && s.good && "border-emerald-200 bg-emerald-50",
                (!on || (!s.bad && !s.good)) && "border-transparent",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] font-bold transition-colors",
                  on ? (s.bad ? "bg-rose-500 text-white" : s.good ? "bg-emerald-500 text-white" : tone === "violet" ? "bg-violet-600 text-white" : "bg-gray-700 text-white") : "bg-gray-100 text-gray-400",
                )}
              >
                {on && s.bad ? <X className="h-3.5 w-3.5" /> : on && s.good ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{s.t}</span>
                <span className="block text-xs text-gray-600">{s.d}</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function DisputeRace() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return setTick(5); // show the finished race, no looping
    if (!inView) return;
    const t = setInterval(() => setTick((v) => (v + 1) % 8), 1100);
    return () => clearInterval(t);
  }, [inView, reduce]);
  const lit = Math.min(tick, 5);
  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-2">
      <Lane title="Optimistic oracle with token-vote escalation" steps={TOKEN_LANE} lit={Math.min(lit, TOKEN_LANE.length)} tone="gray" />
      <Lane title="Novak dispute layer" steps={NOVAK_LANE} lit={lit} tone="violet" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · What each design gives you                                      */
/* ------------------------------------------------------------------ */

type Cell = { v: "yes" | "no" | "na" | "note"; text: string };
const ROWS: { cap: string; price: Cell; optimistic: Cell; novak: Cell }[] = [
  { cap: "Live prices", price: { v: "yes", text: "its core job" }, optimistic: { v: "na", text: "not designed for it" }, novak: { v: "note", text: "reads Chainlink as a source" } },
  { cap: "Corporate actions & halts as facts", price: { v: "no", text: "not provided" }, optimistic: { v: "yes", text: "any question, in prose" }, novak: { v: "yes", text: "machine-checkable specs" } },
  { cap: "Compose AND / OR / BEFORE / WITHIN on-chain", price: { v: "no", text: "—" }, optimistic: { v: "no", text: "—" }, novak: { v: "yes", text: "canonical composite IDs" } },
  { cap: "Hard disputes decided by", price: { v: "na", text: "n/a" }, optimistic: { v: "note", text: "token-holder vote" }, novak: { v: "yes", text: "bonded resolver committees" } },
  { cap: "When nobody can agree", price: { v: "na", text: "n/a" }, optimistic: { v: "no", text: "the vote still picks" }, novak: { v: "yes", text: "VOID → refunds" } },
  { cap: "Fees reward whoever was right", price: { v: "na", text: "—" }, optimistic: { v: "note", text: "bonds and voter rewards" }, novak: { v: "yes", text: "TreasuryVault ⅓·⅓·⅓" } },
];

function Mark({ c }: { c: Cell }) {
  const icon =
    c.v === "yes" ? <Check className="h-3.5 w-3.5" /> : c.v === "no" ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />;
  return (
    <span className="flex items-start gap-2">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full",
          c.v === "yes" && "bg-emerald-100 text-emerald-700",
          c.v === "no" && "bg-rose-100 text-rose-600",
          (c.v === "na" || c.v === "note") && "bg-gray-100 text-gray-500",
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] text-gray-700">{c.text}</span>
    </span>
  );
}

function Comparison() {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-100 bg-white">
      <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr] gap-4 border-b border-violet-100 bg-violet-50/50 px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-600 md:grid">
        <span />
        <span>Price oracle</span>
        <span>Optimistic + token vote</span>
        <span className="text-violet-700">Novak</span>
      </div>
      {ROWS.map((r, i) => (
        <motion.div
          key={r.cap}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className="grid gap-2 border-b border-gray-100 px-5 py-4 last:border-0 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:gap-4"
        >
          <span className="text-sm font-semibold text-ink">{r.cap}</span>
          <span className="md:hidden font-mono text-[10px] uppercase text-gray-400">Price oracle</span>
          <Mark c={r.price} />
          <span className="md:hidden font-mono text-[10px] uppercase text-gray-400">Optimistic + token vote</span>
          <Mark c={r.optimistic} />
          <span className="md:hidden font-mono text-[10px] uppercase text-violet-500">Novak</span>
          <div className="rounded-lg md:-mx-2 md:-my-1 md:bg-violet-50/60 md:px-2 md:py-1">
            <Mark c={r.novak} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STEPS = [
  { icon: Users, t: "Create or reuse an event", d: "Price-at, corporate action, trading status or Fed rate — or reuse an existing ladder's IDs." },
  { icon: Landmark, t: "Wait for the outcome", d: "waitForOutcome() polls the EventBus: Available → settle, Voided → refund." },
  { icon: ShieldCheck, t: "Inherit the dispute layer", d: "Quorum, bonded committees and VOID come with it — no oracle to run." },
];

export function IntegrateSection() {
  return (
    <>
      <WhyItMatters />
      <section className="relative overflow-hidden bg-white py-20">
        <div className="pointer-events-none absolute left-1/2 top-20 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Plug in</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Any market. One dispute layer.</h2>
            <p className="mt-4 text-gray-600">
              Sources and committees feed the <span className="font-semibold text-violet-700">EventBus</span>; every market reads the
              same finalized answer from it.
            </p>
          </div>
          <div className="mt-10">
            <PlugHub />
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.t}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: i * 0.12, duration: 0.45 }}
                className="rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_10px_30px_-22px_rgba(109,74,255,0.6)]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-white">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-[11px] text-violet-600">step {i + 1}</span>
                </div>
                <p className="mt-3 font-semibold text-ink">{s.t}</p>
                <p className="mt-1 text-sm text-gray-600">{s.d}</p>
              </motion.div>
            ))}
          </div>

          <div className="mx-auto mt-24 max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">The difference</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">What happens when a fact is disputed</h2>
            <p className="mt-4 text-gray-600">
              A $200M+ prediction market was once settled by a token-weighted vote against widely reported facts. Novak never asks
              token holders — and when nobody can agree, it <span className="font-semibold text-violet-700">refunds instead of guessing</span>.
            </p>
          </div>
          <div className="mt-10">
            <DisputeRace />
          </div>

          <div className="mx-auto mt-24 max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Side by side</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">An event oracle, not another price feed</h2>
          </div>
          <div className="mt-10">
            <Comparison />
          </div>
        </div>
      </section>
    </>
  );
}
