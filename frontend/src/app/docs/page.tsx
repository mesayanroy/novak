import Link from "next/link";

export const metadata = { title: "Introduction — Novak Docs" };

export default function DocsIntroPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Introduction</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Protocol overview</h1>

      <p className="mt-6 text-gray-700">
        Novak (Neural Event Network) is a decentralized, composable event bus for Ethereum. On-chain
        and real-world events are resolved, finalized, and stored <strong>once</strong>, then composed
        (AND / OR / NOT / BEFORE / WITHIN) and read by many independent smart contracts — instead of
        every application building and trusting its own oracle integration from scratch.
      </p>

      <p className="mt-4 text-gray-700">
        The first consumer application is a derivatives market that settles against composite events.
        Everything on this site describes what is actually implemented and tested in this repository —
        not an aspirational roadmap.
      </p>

      <h2 className="mt-10 text-xl font-semibold">The core idea, in two questions</h2>
      <p className="mt-3 text-gray-700">
        A conventional price oracle answers one question: <em>what is the price, right now?</em> Novak
        answers a different shape of question, once, and keeps the answer as a reusable object:{" "}
        <em>did X happen, and did Y happen within 48 hours of it?</em> That composite answer is itself a
        new, standing on-chain event — any later application can reference it without re-resolving
        anything or even knowing which resolver produced the underlying facts.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Where to go next</h2>
      <ul className="mt-3 flex flex-col gap-2 text-gray-700">
        <li>
          <Link href="/docs/architecture" className="text-ink">
            Architecture
          </Link>{" "}
          — the five layers, bottom to top.
        </li>
        <li>
          <Link href="/docs/lifecycle" className="text-ink">
            Event lifecycle
          </Link>{" "}
          — create, observe, dispute, finalize.
        </li>
        <li>
          <Link href="/docs/composition" className="text-ink">
            Composition
          </Link>{" "}
          — building new events out of finalized ones.
        </li>
        <li>
          <Link href="/docs/sdk" className="text-ink">
            SDK reference
          </Link>{" "}
          — read and write against the protocol from TypeScript.
        </li>
      </ul>
    </article>
  );
}
