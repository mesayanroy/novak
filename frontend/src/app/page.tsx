"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LayerDiagram } from "@/components/architecture/LayerDiagram";
import { ArrowRight, Layers, ShieldCheck, Cpu, Terminal, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pt-28 bg-grid-pattern bg-grid-md">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto flex w-fit items-center gap-2 border border-gray-300 bg-paper px-3 py-1 text-xs font-mono uppercase tracking-wider text-ink rounded-full shadow-sm"
        >
          <span className="h-2 w-2 rounded-full bg-ink animate-pulse-subtle" />
          <span>Ethereum Oracle Primitive v1.0</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl text-ink leading-[1.1]"
        >
          A composable event bus for Ethereum
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 leading-relaxed"
        >
          Events are resolved, finalized, and stored <strong className="text-ink font-semibold">once</strong>, then composed and read by many independent smart contracts — instead of every application building and trusting its own oracle integration from scratch.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Button asChild size="lg" className="gap-2 font-medium">
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

        {/* Hero Features Bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-14 grid grid-cols-2 gap-4 text-left sm:grid-cols-4 border border-gray-300 bg-paper p-4 rounded-sm shadow-sm"
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

      {/* The Idea Comparison */}
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
                Conventional Oracles Answer
              </p>
              <p className="mt-4 text-xl font-medium text-ink">&ldquo;What is the price, right now?&rdquo;</p>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                One question, for whoever asked. The answer belongs solely to that request, requiring every downstream contract to re-fetch and re-verify.
              </p>
            </div>
            <div className="border border-ink bg-paper p-6 rounded-sm shadow-md">
              <p className="font-mono text-xs uppercase tracking-wide text-ink font-semibold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse-subtle" />
                Novak Event Bus Answers
              </p>
              <p className="mt-4 text-xl font-medium text-ink">
                &ldquo;Did X happen, and did Y happen within 48 hours of it?&rdquo;
              </p>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                Once, and keeps the composite answer as a standing object any future application can
                reference — without re-resolving anything or trusting intermediate glue code.
              </p>
            </div>
          </div>
        </div>
      </section>

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
            A derivatives market that needs a multi-condition settlement rule — &ldquo;pay out if A
            happens AND B happens within 48 hours&rdquo; — isn&apos;t one settleable object on most
            oracle designs; it&apos;s custom glue code the market writes and trusts itself, wired to two
            separate integrations. On Novak, that composite condition is a first-class finalized event
            with its own canonical ID, produced once and reusable by any later application that references it —
            without touching a resolver or re-deriving the composition logic.
          </p>
          <p className="mt-4 max-w-2xl text-sm text-gray-500 font-mono">
            See the full comparison against other oracle designs in the <Link href="/docs" className="text-ink underline">docs specification</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
