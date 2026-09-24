export const metadata = { title: "FAQ — Novak Docs" };

const faqs = [
  {
    q: "Isn't this what Chainlink does?",
    a: "Chainlink is Robinhood Chain's price oracle, and Novak resolvers read its feeds. Price feeds answer \"what is the price now\"; they don't provide corporate-action calendars or pause triggers (Chainlink's own docs say so). Novak finalizes those facts — with disputes, history and composition — and every protocol reads the same answer.",
  },
  {
    q: "Is Novak decentralized dispute arbitration finished?",
    a: "No. A bonded, two-tier committee ladder replaced single-owner arbitration and never falls back to a token vote. Committee selection is still block-data pseudo-randomness — weaker on Arbitrum chains like Robinhood Chain, and Chainlink VRF isn't available there — and there's no staking/reputation token behind membership. See Dispute & finalization and the threat model.",
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
    q: "Is the data on /markets real?",
    a: "Yes. Market.sol enumerates its markets on-chain (marketCount/getMarketIds) and the app reads them live, with each event's status and source. Collateral on testnet is MockUSDG — test money with no value.",
  },
  {
    q: "What chain does the demo run on?",
    a: "Robinhood Chain testnet (chain ID 46630). Resolvers read their data — Chainlink stock feeds, ERC-8056 stock tokens, Robinhood's asset registry — from Robinhood Chain mainnet, read-only. Local anvil (31337) is supported for development.",
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
