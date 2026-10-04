import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";

export const metadata = { title: "Integrate — Novak Docs" };

const ONCHAIN = `IEventBus public immutable novak; // the ONLY Novak dependency

function resolve() external {
    IEventBus.Availability a = novak.getAvailability(eventId);
    require(a != IEventBus.Availability.Pending, "not final yet");
    if (a == IEventBus.Availability.Voided) { refundEveryone(); return; }
    bool yes = abi.decode(novak.readOutcome(eventId).outcomeData, (bool));
    settle(yes);
}`;

const OFFCHAIN = `import { NovakClient, getDeployment, robinhoodTestnet } from "@novak/sdk";

const novak = new NovakClient(publicClient, undefined, getDeployment(robinhoodTestnet.id));
const result = await novak.waitForOutcome(eventId);   // pull loop over the Event Bus
if (result.voided) await refundMarket(marketId);
else await settleMarket(marketId, result.outcome);`;

const FEES = `usdg.approve(address(vault), fee);
ITreasuryVault(vault).depositFees(eventIds, fee);
// per event, once decided: 1/3 correct resolvers · 1/3 correct committee voters
// (or insurance reserve) · 1/3 treasury`;

export default function IntegratePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Integrate</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Use Novak as your market&apos;s dispute layer</h1>
      <p className="mt-4 text-gray-700">
        Keep your own trading. Hand the question &ldquo;what actually happened?&rdquo; to Novak. Independent resolvers
        observe the source and must agree. Anyone can dispute, which escalates to bonded Tier-1 (≤7) and Tier-2 (≤15)
        committees needing 66% agreement, never a token vote. An event that can never resolve is <strong>Voided</strong>{" "}
        instead of left hanging. You read the final answer from the Event Bus.
      </p>

      <h2 className="mt-10 text-xl font-semibold">1. Pick or create an event</h2>
      <p className="mt-2 text-gray-700">
        Price at a time (stocks, the SGOV tokenized-Treasury ETF), corporate actions, trading status, or the Fed funds
        rate. See the event catalog in the <Link href="/docs/robinhood">Robinhood Chain</Link> page. Composite and range
        (ladder) questions reuse the same building blocks, and anyone else&apos;s market on the same event reads the same
        answer.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2a. Settle on-chain: three Bus reads</h2>
      <div className="mt-3">
        <CodeBlock code={ONCHAIN} label="Solidity" />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Stop trading once <code>getAvailability</code> is no longer <code>Pending</code>, and always handle{" "}
        <code>Voided</code>. A full tested example ships as <code>examples/integrations/ExternalPredictionMarket.sol</code>.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2b. Settle off-chain (Polymarket-style venues)</h2>
      <div className="mt-3">
        <CodeBlock code={OFFCHAIN} label="TypeScript" />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Every observation&apos;s evidence is public at each resolver&apos;s <code>/evidence/:hash</code>, matching the
        on-chain commitment.
      </p>

      <h2 className="mt-10 text-xl font-semibold">3. Share fees with the layer (optional)</h2>
      <div className="mt-3">
        <CodeBlock code={FEES} label="Solidity" />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        The TreasuryVault pays the people who keep resolution honest. Novak&apos;s own markets route every fee through it.
      </p>
    </article>
  );
}
