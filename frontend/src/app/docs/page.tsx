import Link from "next/link";
import { DocsCookbooks } from "@/components/docs/DocsCookbooks";
import { ArrowRight, BookOpen, Code2, Layers, ShieldCheck, Terminal, Cpu } from "lucide-react";

export const metadata = { title: "Introduction & Specification — Novak Docs" };

export default function DocsIntroPage() {
  return (
    <article className="min-w-0 max-w-none">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">
        <BookOpen className="h-4 w-4 text-ink" />
        Protocol Overview
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Protocol specification
      </h1>

      <p className="mt-6 text-gray-700 text-base leading-relaxed">
        Novak (Neural Event Network) is a decentralized, composable event bus for Ethereum. On-chain
        and real-world events are resolved, finalized, and stored <strong className="text-ink">once</strong>, then composed
        (AND / OR / NOT / BEFORE / WITHIN) and read by many independent smart contracts — instead of
        every application building and trusting its own oracle integration from scratch.
      </p>

      <p className="mt-4 text-gray-700 text-base leading-relaxed">
        The first consumer application is a derivatives market that settles against composite events.
        Everything on this site describes what is actually implemented and tested in this repository —
        not an aspirational roadmap.
      </p>

      {/* Two Shape Questions */}
      <div className="mt-8 border border-gray-300 bg-paper p-6 rounded-sm shadow-sm">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Terminal className="h-4 w-4 text-ink" />
          The core idea, in two questions
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
          <div className="border border-gray-200 bg-gray-50 p-4 rounded-sm">
            <span className="font-mono text-xs text-gray-500 uppercase font-semibold block">Conventional Oracle</span>
            <p className="mt-2 font-medium text-ink">&ldquo;What is the price, right now?&rdquo;</p>
            <p className="mt-1 text-xs text-gray-600">Answered per request, requiring downstream contract re-fetching.</p>
          </div>
          <div className="border border-ink bg-paper p-4 rounded-sm shadow-sm">
            <span className="font-mono text-xs text-ink uppercase font-semibold block">Novak Event Bus</span>
            <p className="mt-2 font-medium text-ink">&ldquo;Did X happen, and did Y happen within 48 hours of it?&rdquo;</p>
            <p className="mt-1 text-xs text-gray-600">Answered once, retained on-chain as a reusable standing fact object.</p>
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold text-ink">Where to go next</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 font-mono text-xs">
        <li className="border border-gray-200 bg-paper p-3 rounded-sm hover:border-ink transition-colors">
          <Link href="/docs/architecture" className="text-ink font-semibold flex items-center justify-between">
            <span>01 / Architecture Spec</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="font-sans text-gray-600 text-xs mt-1">The five layers from EventBus down to BaseRegistry.</p>
        </li>
        <li className="border border-gray-200 bg-paper p-3 rounded-sm hover:border-ink transition-colors">
          <Link href="/docs/lifecycle" className="text-ink font-semibold flex items-center justify-between">
            <span>02 / Event Lifecycle</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="font-sans text-gray-600 text-xs mt-1">Create → Observe → Disputed → Finalized / Voided.</p>
        </li>
        <li className="border border-gray-200 bg-paper p-3 rounded-sm hover:border-ink transition-colors">
          <Link href="/docs/composition" className="text-ink font-semibold flex items-center justify-between">
            <span>03 / Composition Rules</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="font-sans text-gray-600 text-xs mt-1">Building new composite events out of finalized ones.</p>
        </li>
        <li className="border border-gray-200 bg-paper p-3 rounded-sm hover:border-ink transition-colors">
          <Link href="/docs/sdk" className="text-ink font-semibold flex items-center justify-between">
            <span>04 / TypeScript SDK</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="font-sans text-gray-600 text-xs mt-1">Read and write against the protocol via @novak/sdk.</p>
        </li>
      </ul>

      {/* Developer Cookbooks & Chunked Code Cards */}
      <DocsCookbooks />
    </article>
  );
}
