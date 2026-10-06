import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { DocHeader } from "@/components/docs/DocPrimitives";
import { Plug } from "lucide-react";

export const metadata = { title: "Integrate — Novak Docs" };

const REUSE = `const from = BigInt(getDeployment(46630).startBlock);

// Same question already on Novak? Settle on it instead of creating a duplicate.
const [existing] = await novak.findMatchingEvents({ sourceId, spec, onlyOpen: true }, from);

// Range market: reuse the "NVDA ≥ X at T" boundaries that already exist.
const rungs = await novak.findPriceLadder({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, at: T }, from);
const { reuse, create } = planLadder(rungs, thresholds); // create only what's missing`;

const ONCHAIN = `import { NovakConsumer } from "novak/contracts/integrations/NovakConsumer.sol";

contract MyMarket is NovakConsumer {        // holds ONLY the Event Bus
    bytes32 public immutable eventId;
    constructor(address bus, bytes32 id) NovakConsumer(bus) { eventId = id; }

    function deposit(bool yes) external payable whenNovakPending(eventId) { /* … */ }
    function resolve() external { _settleWithNovak(eventId); }

    function _onNovakResolved(bytes32, bool yes) internal override { /* pay winners */ }
    function _onNovakVoided(bytes32) internal override { /* refund everyone */ }
}
// Range markets: (Resolution status, uint256 bucket) = novakRange(boundaries);`;

const CTF = `// NovakCTFAdapter(eventBus, conditionalTokens) is your condition's oracle.
await novak.ctfPrepareBinary(adapter, eventId, account);         // slot 0 = YES
await novak.ctfPrepareRange(adapter, boundaryEventIds, account); // n boundaries ⇒ n+1 slots
// … trade outcome tokens exactly as today …
if (await novak.ctfCanResolve(adapter, questionId))
  await novak.ctfResolve(adapter, questionId, account);          // voided ⇒ equal payouts (refund)`;

const OFFCHAIN = `import { NovakClient, getDeployment, robinhoodTestnet } from "@novakoracle/sdk";

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
      <DocHeader icon={Plug} eyebrow="Markets · Integrate your market" title="Use Novak as your market's dispute layer" />
      <p className="mt-4 text-gray-700">
        Keep your own trading. Hand the question &ldquo;what actually happened?&rdquo; to Novak. Independent resolvers
        observe the source and must agree. Anyone can dispute, which escalates to bonded Tier-1 (≤7) and Tier-2 (≤15)
        committees needing 66% agreement, never a token vote. An event that can never resolve is <strong>Voided</strong>{" "}
        instead of left hanging. You read the final answer from the Event Bus.
      </p>

      <div className="mt-6">
        <CodeBlock code={"npm i @novakoracle/sdk viem"} label="install" />
      </div>

      <h2 className="mt-10 text-xl font-semibold">1. Reuse or create the event</h2>
      <p className="mt-2 text-gray-700">
        An event is observed, disputed and finalized once, and every market that reads it settles on the same answer. Reuse
        first: each <Link href="/events">event page</Link> has a <strong>Reuse this event</strong> panel, and the{" "}
        <Link href="/build">Builder</Link> warns you before you create a duplicate. To ask something new, pick price at a
        time (stocks, SGOV), corporate actions, trading status or the Fed funds rate. The catalog is on the{" "}
        <Link href="/docs/robinhood">Robinhood Chain</Link> page.
      </p>
      <div className="mt-3">
        <CodeBlock code={REUSE} label="TypeScript" />
      </div>

      <h2 className="mt-10 text-xl font-semibold">2a. Settle on-chain: inherit NovakConsumer</h2>
      <div className="mt-3">
        <CodeBlock code={ONCHAIN} label="Solidity" />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        You get <code>novakResolution</code> (Pending / True / False / Voided), <code>whenNovakPending</code>,{" "}
        <code>_settleWithNovak</code>, <code>novakRange</code> and <code>_novakOutcome</code> (with{" "}
        <code>occurredAt</code>). It ships as <code>contracts/integrations/NovakConsumer.sol</code>, with tests that include
        the guard that it holds only the Bus.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2b. Conditional Tokens venues: NovakCTFAdapter</h2>
      <div className="mt-3">
        <CodeBlock code={CTF} label="TypeScript" />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Polymarket-style venues keep their CTF positions. The adapter becomes the condition&apos;s oracle and reports
        Novak&apos;s answer once any dispute has run its course. Question IDs are deterministic per event, so venues on the
        same event share one condition.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2c. Settle off-chain</h2>
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
