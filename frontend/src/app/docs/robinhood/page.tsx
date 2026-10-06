import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { DocHeader } from "@/components/docs/DocPrimitives";
import { Building2 } from "lucide-react";

export const metadata = { title: "Robinhood Chain — Novak Docs" };

const network = [
  ["Deployed on", "Robinhood Chain testnet — chain ID 46630 (Arbitrum Orbit L2, ETH gas)"],
  ["RPC", "https://rpc.testnet.chain.robinhood.com"],
  ["Explorer", "https://explorer.testnet.chain.robinhood.com"],
  ["Faucet", "https://faucet.testnet.chain.robinhood.com"],
  ["Data read from", "Robinhood Chain mainnet (4663) — read-only, no funds"],
  ["Collateral", "MockUSDG on testnet (6 decimals); real USDG on mainnet is 0x5fc5…d168"],
];

const catalog = [
  {
    id: "chainlink.price-at.v1",
    v: 2,
    q: "Is NVDA ≥ $250 at 16:00 on Oct 9?",
    src: "Chainlink “Robinhood NVDA / USD” feed on mainnet — the round in effect at T (binary search), rejected if older than maxStaleness",
  },
  {
    id: "rh.corporate-action.v1",
    v: 2,
    q: "Did NVDA have a split-size multiplier change effective this week?",
    src: "The stock token’s own ERC-8056 UIMultiplierUpdated(old, new, effectiveAt) logs; minChangeBps separates splits from dividend reinvestment",
  },
  {
    id: "rh.trading-status.v1",
    v: 1,
    q: "Is TSLA NOT tradable in the overnight session right now?",
    src: "Robinhood’s public asset registry (tradingCapabilities per session)",
  },
];

const CONSUME = `import { IEventBus } from "novak-contracts/interfaces/IEventBus.sol";

contract MyLendingPool {
    IEventBus public immutable novak; // the ONLY Novak dependency

    function _corporateActionActive(bytes32 eventId) internal view returns (bool) {
        if (novak.getAvailability(eventId) != IEventBus.Availability.Available) return false;
        return abi.decode(novak.readOutcome(eventId).outcomeData, (bool));
    }
}`;

const CREATE = `import { NovakClient, SOURCES, sourceId, encodeCorporateActionSpec, STOCK_TOKENS_MAINNET } from "@novakoracle/sdk";

await client.createEvent({
  specVersion: 2,                                   // outcome carries occurredAt
  sourceId: sourceId(SOURCES.corporateAction),
  openTimestamp: weekStart,
  observationDeadline: weekEnd + 86_400n,
  disputeWindowSeconds: 3_600n,
  quorumThreshold: 2,
  spec: encodeCorporateActionSpec({
    stockToken: STOCK_TOKENS_MAINNET.NVDA,
    windowStart: weekStart, windowEnd: weekEnd,
    minChangeBps: 5_000,                            // split-size only
  }),
}, account);`;

export default function RobinhoodDocsPage() {
  return (
    <article>
      <DocHeader icon={Building2} eyebrow="Start here · Robinhood Chain" title="The event layer for tokenized stocks" />
      <p className="mt-4 text-gray-700">
        Robinhood Chain ships Chainlink price feeds for its stock tokens. It does not ship the facts around those prices:
        Chainlink&apos;s docs state it &ldquo;does not provide corporate-action calendar data or automated pause
        triggers&rdquo;, and Robinhood&apos;s docs call the token&apos;s <code>oraclePaused()</code> flag &ldquo;advisory and
        not enforced on-chain&rdquo;. Novak resolves those facts once and every protocol reads the same answer.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Novak and Chainlink</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-300 font-mono text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-4" />
              <th className="py-2 pr-4">Chainlink on Robinhood Chain</th>
              <th className="py-2">Novak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[
              ["Answers", "What is NVDA’s price now?", "What happened, when, and in what combination?"],
              ["Shape", "Continuous number, 24/5", "Discrete finalized fact + occurredAt"],
              ["History", "Current round", "A past fact stays readable forever"],
              ["Disagreement", "—", "Bonded two-tier committees, never a token vote"],
              ["Composition", "—", "AND / OR / NOT / BEFORE / WITHIN, canonical IDs"],
              ["Relationship", "A Novak data source", "Reads Chainlink; doesn’t replace it"],
            ].map(([k, a, b]) => (
              <tr key={k}>
                <td className="py-2 pr-4 font-mono text-xs text-gray-500">{k}</td>
                <td className="py-2 pr-4">{a}</td>
                <td className="py-2">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Network</h2>
      <dl className="mt-4 grid gap-2 text-sm">
        {network.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[140px_1fr] gap-3">
            <dt className="font-mono text-xs text-gray-500">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">Event catalog</h2>
      <p className="mt-2 text-gray-700">
        <code>EventSpec.sourceId = keccak256(name)</code>; the <code>spec</code> bytes use the SDK encoders. specVersion 2
        outcomes carry <code>occurredAt</code>, so BEFORE/WITHIN compare when facts happened, not when they were finalized.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {catalog.map((c) => (
          <div key={c.id} className="border border-gray-300 p-4">
            <p className="font-mono text-sm font-semibold">
              {c.id} <span className="text-gray-500 font-normal">· specVersion {c.v}</span>
            </p>
            <p className="mt-1 text-sm">&ldquo;{c.q}&rdquo;</p>
            <p className="mt-1 text-xs text-gray-600">Source: {c.src}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Consume an event from your contract</h2>
      <div className="mt-4">
        <CodeBlock code={CONSUME} label="Solidity" />
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Hold only an <code>IEventBus</code> reference, and handle <code>Voided</code> if you hold funds. The shipped{" "}
        <Link href="/guard">StockLendingGuard</Link> does exactly this.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Create an event</h2>
      <div className="mt-4">
        <CodeBlock code={CREATE} label="TypeScript" />
      </div>
    </article>
  );
}
