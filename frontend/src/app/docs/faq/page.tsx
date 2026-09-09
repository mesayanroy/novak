export const metadata = { title: "FAQ — Novak Docs" };

const faqs = [
  {
    q: "Is Novak decentralized dispute arbitration finished?",
    a: "No. The MVP replaced a single-owner arbitrator with a bonded, two-tier committee ladder that never falls back to a token vote — a real structural change, not a relabeling. Committee selection is still block-data pseudo-randomness (not VRF-based), and there's no on-chain staking/reputation token behind committee membership yet. See Dispute & finalization and the threat model.",
  },
  {
    q: "Why is K_OF_N not available yet?",
    a: "It's explicitly out of scope for this pass, tracked as a deliberate post-MVP extension in SPEC_AND_TASKS.md. AND/OR/NOT/BEFORE/WITHIN cover the MVP's composition requirements.",
  },
  {
    q: "Is there a live REST API?",
    a: "No. The Events API reference page documents the intended surface against the real on-chain function signatures already implemented, so a future indexer/API layer has an exact contract to build against.",
  },
  {
    q: "Why does /markets show example data?",
    a: "Market.sol has no enumeration getter — only a keyed markets(marketId) lookup. Listing \"all markets\" requires an indexer that doesn't exist yet. Every example section is marked visibly, not just in a code comment.",
  },
  {
    q: "What chain does the demo run on?",
    a: "Local Anvil (chain id 31337) only, matching the current deployment. No public testnet deployment exists yet — see SPEC_AND_TASKS.md Issue #20.",
  },
];

export default function FaqPage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">FAQ</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Frequently asked questions</h1>

      <div className="mt-8 flex flex-col divide-y divide-gray-200 border-t border-gray-200">
        {faqs.map((item) => (
          <div key={item.q} className="py-6">
            <p className="font-semibold">{item.q}</p>
            <p className="mt-2 text-gray-700">{item.a}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
