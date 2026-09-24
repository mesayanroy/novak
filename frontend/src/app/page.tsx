"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LayerDiagram } from "@/components/architecture/LayerDiagram";
import { BentoIdeaSection } from "@/components/BentoIdeaSection";
import { Iphone } from "@/registry/magicui/iphone";
import { ArrowRight, Layers, ShieldCheck, Cpu, Terminal, Sparkles, Activity, Radio, TrendingUp } from "lucide-react";
import { Availability } from "@novak/sdk";
import { deployment } from "@/lib/addresses";
import { useEvents } from "@/lib/novak";

/** Live banner: the most recently decided Novak event on the configured
 *  chain — or a plain tagline when no deployment is configured. Never
 *  fabricated numbers. */
function LiveBanner() {
  const { data } = useEvents();
  const latest = data?.find((e) => e.availability !== Availability.Pending);
  if (!deployment || !latest) {
    return (
      <span className="text-gray-300">
        Built on Robinhood Chain — the event layer for tokenized stocks.
      </span>
    );
  }
  const verdict =
    latest.availability === Availability.Voided
      ? "VOIDED"
      : latest.kind === "composite"
        ? latest.compositeStatus?.toUpperCase()
        : "FINALIZED";
  return (
    <span className="text-gray-300">
      Latest on Robinhood Chain testnet: {latest.title} → <strong className="text-paper">{verdict}</strong>
    </span>
  );
}

const GAP_QUOTES = [
  {
    quote:
      "Chainlink does not provide corporate-action calendar data or automated pause triggers; pause timing and multiplier updates are coordinated by Robinhood.",
    source: "Chainlink docs — Robinhood Tokenized Equities",
    href: "https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood",
  },
  {
    quote: "oraclePaused() … is advisory and not enforced on-chain.",
    source: "Robinhood Chain docs — Oracles & Price Feeds",
    href: "https://docs.robinhood.com/chain/oracles-and-price-feeds/",
  },
  {
    quote: "Subscribe to UIMultiplierUpdated events … handle multiplier changes in lending collateral calculations.",
    source: "Robinhood Chain docs — Building with Stock Tokens",
    href: "https://docs.robinhood.com/chain/building-with-stock-tokens/",
  },
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      {/* Live Market Ticker Banner */}
      <div className="border-b border-gray-200 bg-gray-900 text-paper py-2 overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> NOVAK:
            </span>
            <LiveBanner />
          </div>
          <Link href="/markets" className="hidden sm:flex items-center gap-1 text-gray-400 hover:text-paper transition-colors font-semibold">
            View markets <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-16 bg-grid-pattern bg-grid-md">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          {/* Left Column: Left-Aligned Hero Text */}
          <div className="flex flex-col items-start text-left lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 border border-purple-200/80 bg-purple-50/80 px-3.5 py-1 text-xs font-mono uppercase tracking-wider text-purple-900 rounded-full shadow-sm"
            >
              <span className="h-2 w-2 rounded-full bg-purple-600 animate-pulse-subtle" />
              <span>Built on Robinhood Chain • Event layer for tokenized stocks</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-ink leading-[1.08]"
            >
              Chainlink tells your contract the price. Novak tells it what happened.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="mt-6 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl"
            >
              Splits, dividends, trading halts, price-at-close conditions: Novak turns what happens to Robinhood Stock
              Tokens into finalized on-chain facts — resolved <strong className="text-ink font-semibold">once</strong> by
              independent resolvers, disputable by bonded committees (never a token vote), composable with AND / OR /
              WITHIN, and read by every lending market, perp and prediction market on the chain.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              <Button asChild size="lg" className="gap-2 font-medium bg-purple-600 hover:bg-purple-700 text-white shadow-md">
                <Link href="/markets">
                  View markets <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="gap-2 font-medium border-gray-300">
                <Link href="/docs">
                  <Terminal className="h-4 w-4" /> Read the docs
                </Link>
              </Button>
            </motion.div>
          </div>

          {/* Right Column: Vertically Straight iPhone Mockup (Same size scale as hero text) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative flex items-center justify-center lg:col-span-5 lg:justify-end mt-4 lg:mt-0"
          >
            <div className="w-[240px] sm:w-[265px] lg:w-[285px] rotate-0">
              <Iphone src="/iphone-screen.png" />
            </div>
          </motion.div>
        </div>

        {/* Hero Features Bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-12 grid grid-cols-2 gap-4 text-left sm:grid-cols-4 border border-gray-300 bg-paper p-4 rounded-sm shadow-sm"
        >
          <div className="border-r border-gray-200 pr-3 last:border-r-0">
            <span className="font-mono text-[10px] text-gray-500 uppercase font-semibold block">01 / DISPUTE GUARD</span>
            <span className="font-semibold text-sm text-ink block mt-0.5">Two-Tier Ladder</span>
          </div>
          <div className="border-r border-gray-200 pr-3 last:border-r-0">
            <span className="font-mono text-[10px] text-gray-500 uppercase font-semibold block">02 / COMPOSITION</span>
            <span className="font-semibold text-sm text-ink block mt-0.5">AND / OR / WITHIN</span>
          </div>
          <div className="border-r border-gray-200 pr-3 last:border-r-0">
            <span className="font-mono text-[10px] text-gray-500 uppercase font-semibold block">03 / READ PATTERN</span>
            <span className="font-semibold text-sm text-ink block mt-0.5">Pull-based EventBus</span>
          </div>
          <div>
            <span className="font-mono text-[10px] text-gray-500 uppercase font-semibold block">04 / SAFETY FLOOR</span>
            <span className="font-mono font-semibold text-sm text-ink block mt-0.5">VOID State Hard Floor</span>
          </div>
        </motion.div>
      </section>

      {/* The Idea Comparison & Bento Grid Section */}
      <section className="border-y border-gray-200 bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">The idea</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
            A different shape of question
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="border border-gray-300 bg-paper p-6 rounded-sm shadow-sm">
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Chainlink answers (a Novak data source)
              </p>
              <p className="mt-4 text-xl font-medium text-ink">&ldquo;What is NVDA&apos;s price right now?&rdquo;</p>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                A continuous number, 24/5, holding the last price when markets close. Essential — and Novak resolvers read
                it directly. But a price feed can&apos;t say <em>why</em> the number jumped, or whether trading stopped.
              </p>
            </div>
            <div className="border border-ink bg-paper p-6 rounded-sm shadow-md">
              <p className="font-mono text-xs uppercase tracking-wide text-ink font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse-subtle" />
                Novak answers
              </p>
              <p className="mt-4 text-xl font-medium text-ink">
                &ldquo;Did NVDA split this week — and was it trading above $X within 24h of it?&rdquo;
              </p>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                A discrete, finalized fact with the time it happened — kept as a standing object with a canonical ID that
                any market or lending protocol reads, without re-resolving anything or writing its own oracle glue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The gap on Robinhood Chain — in the chain's own words */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">The gap on Robinhood Chain</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
          Prices are covered. What happens to the stock isn&apos;t.
        </h2>
        <p className="mt-3 max-w-3xl text-gray-600">
          Robinhood Chain ships Chainlink price feeds for its stock tokens. Everything else a lending market or derivative
          needs to stay solvent through a split or a halt is left to each integrator:
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {GAP_QUOTES.map((q) => (
            <figure key={q.href} className="border border-gray-300 bg-paper p-5 rounded-sm">
              <blockquote className="text-sm text-ink leading-relaxed">&ldquo;{q.quote}&rdquo;</blockquote>
              <figcaption className="mt-3 font-mono text-[11px] text-gray-500">
                <a href={q.href} target="_blank" rel="noreferrer" className="underline">
                  {q.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-gray-700">
          Novak resolves those facts once — from the stock tokens&apos; own ERC-8056 logs, Chainlink rounds, and Robinhood&apos;s
          asset registry — and every protocol reads the same finalized answer.{" "}
          <Link href="/calendar" className="underline">See the corporate-action calendar</Link> or the{" "}
          <Link href="/guard" className="underline">lending guard</Link>.
        </p>
      </section>

      {/* Bento Grid Architecture Features */}
      <BentoIdeaSection />

      {/* Architecture Section */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">Architecture</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
              Five layers, one strict dependency rule
            </h2>
            <p className="mt-2 text-gray-600">
              Each layer talks only to the interface directly beneath it — never around it.
            </p>
          </div>
          <Link href="/docs/architecture" className="link-plain font-mono text-xs uppercase tracking-wider text-ink font-semibold border-b border-ink pb-0.5 hover:text-gray-700">
            Read full spec →
          </Link>
        </div>

        <LayerDiagram />
      </section>

      {/* Why It Matters */}
      <section className="border-t border-gray-200 bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">Why it matters</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
            Composable facts, not one-off integrations
          </h2>
          <p className="mt-4 max-w-3xl text-gray-700 text-base leading-relaxed">
            One NVDA corporate-action event, finalized once, is read by two very different contracts on Robinhood
            Chain: a market that settles on it, and a lending guard that pauses NVDA liquidations while it&apos;s true.
            Neither integrates an oracle; both read the same fact through the EventBus. A multi-condition rule —
            &ldquo;NVDA above $X AND a split within the week&rdquo; — is itself a first-class event with a canonical ID,
            so the next protocol that needs it reuses the answer instead of rebuilding the glue.
          </p>
          <p className="mt-4 max-w-2xl text-sm text-gray-500 font-mono">
            See the full comparison against other oracle designs in the <Link href="/docs" className="text-ink underline">docs specification</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
