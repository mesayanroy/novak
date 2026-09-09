import { CodeBlock } from "@/components/CodeBlock";

export const metadata = { title: "Composition — Novak Docs" };

const operators = [
  {
    name: "AND",
    arity: "2+",
    rule: "True iff every operand resolved true.",
  },
  {
    name: "OR",
    arity: "2+",
    rule: "True iff any operand resolved true.",
  },
  {
    name: "NOT",
    arity: "1",
    rule: "Negates its single operand.",
  },
  {
    name: "BEFORE",
    arity: "2",
    rule: "True iff both resolved true and operand 0 finalized strictly before operand 1.",
  },
  {
    name: "WITHIN",
    arity: "2 + window",
    rule: "True iff both resolved true and their finalization timestamps differ by at most `window` seconds (inclusive).",
  },
];

export default function CompositionPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Composition</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Building new events from finalized ones</h1>

      <p className="mt-6 text-gray-700">
        <code className="font-mono text-sm">EventComposer</code> builds composite events from primitive
        (or other composite) event IDs, deterministically, without duplicating Registry state. A
        composite is itself just another finalized event — composable again, readable by any
        application.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-ink">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">
                Operator
              </th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">
                Operands
              </th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">
                Rule
              </th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.name} className="border-b border-gray-200">
                <td className="px-3 py-3 font-mono font-semibold">{op.name}</td>
                <td className="px-3 py-3 text-gray-600">{op.arity}</td>
                <td className="px-3 py-3 text-gray-700">{op.rule}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-3 font-mono font-semibold text-gray-400">K_OF_N</td>
              <td className="px-3 py-3 text-gray-400">—</td>
              <td className="px-3 py-3 text-gray-500">
                <span className="border border-dashed border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                  Coming soon
                </span>{" "}
                — explicitly out of scope for this pass (SPEC_AND_TASKS.md Issue #10). Not implemented,
                not deployed.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Canonical identity</h2>
      <p className="mt-3 text-gray-700">
        Operand order is canonicalized (sorted ascending) for every order-independent operator —{" "}
        <code className="font-mono text-sm">AND</code>, <code className="font-mono text-sm">OR</code>,{" "}
        <code className="font-mono text-sm">NOT</code>, <code className="font-mono text-sm">WITHIN</code> —
        so two apps independently composing <code className="font-mono text-sm">AND(a, b)</code> and{" "}
        <code className="font-mono text-sm">AND(b, a)</code> land on the same on-chain object.{" "}
        <code className="font-mono text-sm">BEFORE</code> is the deliberate exception: &ldquo;A before
        B&rdquo; is not the same claim as &ldquo;B before A&rdquo;, so its operand order is preserved
        exactly as given.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Example</h2>
      <p className="mt-3 text-gray-700">
        The canonical demo composes a rate-decision event and a price-threshold event with{" "}
        <code className="font-mono text-sm">WITHIN(48h)</code>:
      </p>
      <CodeBlock
        className="mt-4"
        label="TypeScript"
        code={`const compositeId = await client.createComposite(
  {
    op: CompositeOp.Within,
    operands: [rateDecisionEventId, priceThresholdEventId],
    window: 48n * 60n * 60n,
  },
  account,
);`}
      />

      <h2 className="mt-10 text-xl font-semibold">Structural bounds</h2>
      <p className="mt-3 text-gray-700">
        Composition depth is capped at 8, and fan-in (operands per composite) at 10 —
        enforced at creation time. Cycles are not just bounded, they are cryptographically impossible:
        a composite&apos;s ID is a hash of its own operands, so it cannot reference itself without
        already knowing an ID that only exists after that same hash is computed. See{" "}
        <a href="/docs/threat-model" className="text-ink">
          Threat model
        </a>{" "}
        for the full proof.
      </p>
    </article>
  );
}
