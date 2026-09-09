export const metadata = { title: "Threat model — Novak Docs" };

export default function ThreatModelPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Threat model</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Condensed summary</h1>

      <p className="mt-6 text-gray-700">
        This page condenses the two claims most likely to get pressure-tested by judges or auditors.
        The full adversary list — malicious resolvers, dispute griefing, committee-selection
        pseudo-randomness, and more — lives in{" "}
        <code className="font-mono text-sm">docs/threat-model.md</code>.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Cycle-impossibility proof</h2>
      <p className="mt-3 text-gray-700">
        A composite&apos;s ID is <code className="font-mono text-sm">keccak256(op, canonicalOperands, window)</code> —
        a hash of its own definition, including its operand list. For a composite to reference itself,
        its operands would need to already contain its own ID <em>before</em> that ID has been computed
        — which requires inverting keccak256, computationally infeasible. Combined with{" "}
        <code className="font-mono text-sm">EventComposer</code> requiring every operand to already
        exist in storage at creation time, every edge in the composition graph points to a node created
        strictly earlier. No cycle, of any length, can be constructed — not bounded, <em>impossible</em>.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Terminal-state propagation</h2>
      <p className="mt-3 text-gray-700">
        Before this was implemented, a <code className="font-mono text-sm">Voided</code> primitive left
        every composite depending on it stuck reporting &ldquo;not yet resolved&rdquo; forever — no
        signal anything was wrong. The precedence now applied uniformly across every operator:
      </p>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-gray-700">
        <li>A decisive short-circuit wins regardless of any sibling&apos;s state (AND/BEFORE/WITHIN on any False; OR on any True).</li>
        <li>Otherwise, a genuinely-pending sibling keeps the composite Unresolved — normal openness, not a stall.</li>
        <li>Otherwise, a Voided sibling makes the composite Voided — the actual fix.</li>
        <li>Otherwise every sibling is decided and the normal comparison applies.</li>
      </ol>
      <p className="mt-3 text-gray-700">
        This is genuinely novel surface area relative to the closest competitor: an optimistic-oracle
        design with no composition layer has never had to define what &ldquo;an assertion that never
        resolved&rdquo; means to a downstream assertion, because no such relationship exists there.
      </p>

      <div className="mt-8 border border-gray-300 p-4">
        <p className="text-sm text-gray-700">
          Full adversary list, mitigations, and residual gaps (including the committee-selection
          pseudo-randomness limitation):{" "}
          <span className="font-mono text-sm">docs/threat-model.md</span> in the repository.
        </p>
      </div>
    </article>
  );
}
