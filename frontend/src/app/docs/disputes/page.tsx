export const metadata = { title: "Dispute & finalization — Novak Docs" };

export default function DisputesPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Dispute &amp; finalization</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">A bonded committee ladder, never a vote</h1>

      <p className="mt-6 text-gray-700">
        Every number on this page is read directly off{" "}
        <code className="font-mono text-sm">contracts/DisputeManager.sol</code>&apos;s constants — not
        re-derived or rounded.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-ink">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Constant</th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Value</th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Meaning</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {[
              ["DISPUTE_BOND", "0.01 ETH", "Bond to open a dispute against a proposed outcome."],
              ["TIER1_BOND", "0.03 ETH", "Bond per Tier-1 committee vote."],
              ["TIER1_COMMITTEE_SIZE", "7", "Max Tier-1 committee members (the whole resolver pool if smaller)."],
              ["TIER1_WINDOW", "1 hour", "Time Tier-1 has to reach agreement."],
              ["TIER2_BOND", "0.08 ETH", "Bond per Tier-2 committee vote."],
              ["TIER2_COMMITTEE_SIZE", "15", "Max Tier-2 committee members."],
              ["TIER2_WINDOW", "2 hours", "Time Tier-2 has to reach agreement."],
              ["AGREEMENT_BPS", "66", "% of committee SIZE (not participants) required to converge."],
            ].map(([k, v, m]) => (
              <tr key={k} className="border-b border-gray-200">
                <td className="px-3 py-3 font-mono text-xs">{k}</td>
                <td className="px-3 py-3 font-mono font-semibold">{v}</td>
                <td className="px-3 py-3">{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Bond accounting on convergence</h2>
      <p className="mt-3 text-gray-700">
        When a tier converges, the losing side&apos;s bonds split three ways: one third burned, one
        third distributed pro-rata to the winning committee members (on top of their own bond back),
        one third to a fixed treasury address. The original disputer&apos;s bond rides on whether the
        committee agreed with them — overturned proposal refunds it in full; upheld proposal forfeits
        it via the same burn/treasury split.
      </p>

      <h2 className="mt-10 text-xl font-semibold">VOID is a hard floor</h2>
      <p className="mt-3 text-gray-700">
        If Tier-2 also fails to reach 66% agreement, the event is marked permanently{" "}
        <code className="font-mono text-sm">Voided</code> and every remaining bond is refunded in full
        — nobody was proven right or wrong. This never escalates further: there is no Tier-3, and no
        fallback to a token-weighted vote of any kind. That is the concrete difference from an
        optimistic-oracle design whose disputes can escalate to token-holder governance.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Stated limitations</h2>
      <p className="mt-3 text-gray-700">
        Committee selection is block-data pseudo-randomness, not VRF-based — sufficient to spread
        selection across the resolver pool, but not resistant to a miner/validator choosing whether to
        include the triggering transaction in a favorable block. There is also no on-chain
        staking/reputation token yet: every committee member in a tier posts the same fixed bond rather
        than a variable stake. See{" "}
        <a href="/docs/threat-model" className="text-ink">
          Threat model
        </a>{" "}
        for the full write-up.
      </p>
    </article>
  );
}
