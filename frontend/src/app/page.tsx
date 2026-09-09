import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayerDiagram } from "@/components/architecture/LayerDiagram";

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center sm:pt-28">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A composable event bus for Ethereum
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Events are resolved, finalized, and stored once, then composed and read by many independent
          smart contracts — instead of every application building and trusting its own oracle
          integration from scratch.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/markets">View markets</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500">The idea</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            A different shape of question
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="border border-gray-300 bg-paper p-6">
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500">A conventional oracle answers</p>
              <p className="mt-3 text-xl">&ldquo;What is the price, right now?&rdquo;</p>
              <p className="mt-3 text-sm text-gray-600">
                One question, for whoever asked. The answer belongs to that request.
              </p>
            </div>
            <div className="border border-ink bg-paper p-6">
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Novak answers</p>
              <p className="mt-3 text-xl">
                &ldquo;Did X happen, and did Y happen within 48 hours of it?&rdquo;
              </p>
              <p className="mt-3 text-sm text-gray-600">
                Once, and keeps the composite answer as a standing object any future application can
                reference — without re-resolving anything, or knowing which resolver produced the
                underlying facts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Architecture</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Five layers, one dependency rule</h2>
        <p className="mt-3 text-gray-600">
          Each layer talks only to the interface directly beneath it — never around it.
        </p>
        <div className="mt-8">
          <LayerDiagram />
        </div>
        <p className="mt-6">
          <Link href="/docs/architecture" className="text-sm text-ink">
            Read the full architecture →
          </Link>
        </p>
      </section>

      <section className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Why it matters</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Composable facts, not one-off integrations
          </h2>
          <p className="mt-4 max-w-2xl text-gray-700">
            A derivatives market that needs a multi-condition settlement rule — &ldquo;pay out if A
            happens AND B happens within 48 hours&rdquo; — isn&apos;t one settleable object on most
            oracle designs; it&apos;s glue code the market writes and trusts itself, wired to two
            separate integrations. On Novak, that composite condition is a first-class finalized event
            with its own ID, produced once and reusable by any later application that references it —
            without touching a resolver or re-deriving the composition logic.
          </p>
          <p className="mt-4 max-w-2xl text-sm text-gray-500">
            For the fuller comparison against other oracle designs and their tradeoffs, see the docs.
          </p>
        </div>
      </section>
    </main>
  );
}
