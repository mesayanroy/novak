import { ShieldCheck } from "lucide-react";
import { C, Callout, DataTable, DocHeader, H2, P, StatGrid } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Threat model — Novak Docs" };

type Status = "fixed" | "mitigated" | "partial" | "open" | "deferred" | "by design";

const STATUS: Record<Status, string> = {
  fixed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  mitigated: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "by design": "bg-violet-50 text-violet-700 border-violet-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  open: "bg-rose-50 text-rose-700 border-rose-200",
  deferred: "bg-gray-50 text-gray-600 border-gray-200",
};

const THREATS: [n: number, threat: string, defense: string, status: Status][] = [
  [1, "One malicious or faulty resolver", "Quorum needs quorumThreshold byte-identical answers; one resolver can't propose alone.", "mitigated"],
  [2, "Colluding resolver majority", "Anyone can dispute; committees are drawn from the whole pool; Tier 2 then VOID, never a token vote. Residual: if the colluders ARE the pool they also sit on committees; authorization is owner-gated; flat bonds, no stake.", "partial"],
  [3, "Late or stale observation", "Rejected after observationDeadline; price-at abstains on rounds older than maxStaleness.", "fixed"],
  [4, "Dispute spam / griefing", "A wrong disputer loses the 0.01 ETH bond; one dispute case per event. Residual: bonds are flat, not scaled to stakes.", "mitigated"],
  [5, "Event Bus bypass by a consumer", "Consumers hold only Settlement / IEventBus — enforced by a guard test per consumer.", "mitigated"],
  [6, "Composite griefing (unknown operands, huge or cyclic graphs, dead operands)", "Operands must exist; ≤10 children, depth ≤8; cycles impossible (proof below); voided operands propagate.", "mitigated"],
  [7, "Non-deterministic composition", "Uses committed finalizedAt / occurredAt, never block time at resolution; result cached forever.", "mitigated"],
  [8, "Front-running market creation / settlement (MEV)", "Out of MVP scope.", "deferred"],
  [9, "Careless outcome decoding", "bool stays the first ABI word in v2; every decode site audited; Registry rejects malformed v2 payloads.", "fixed"],
  [10, "Committee-selection manipulation", "Block-data seed is predictable on Arbitrum chains (prevrandao = 1); no VRF on Robinhood Chain. Keep pool ≤ 7 (committee = whole pool) until commit-reveal.", "open"],
  [11, "Losers exit after the outcome is public", "tradingClosesAt + 'outcome known' checks on every deposit/withdraw/trade.", "fixed"],
  [12, "Voided event locks market funds", "getAvailability returns Voided; Market refunds; range markets pay 1/N.", "fixed"],
  [13, "Observations before the event happens", "Rejected before openTimestamp; resolvers also wait.", "fixed"],
  [14, "Reverting recipient freezes a dispute", "Pull payments (pendingWithdrawals + withdraw()).", "fixed"],
  [15, "Spoofed position ledger", "Only the wired Market can record positions.", "fixed"],
  [16, "Sequencer / timestamp trust", "Windows are minutes-to-hours; no sequencer-uptime feed on Robinhood Chain, so price-at relies on maxStaleness.", "partial"],
  [17, "Wrong or compromised source data", "Dispute ladder is the backstop; raw evidence served at /evidence/:hash.", "partial"],
  [18, "LMSR market-maker loss", "Bounded at b·ln N (the price of liquidity); reserve ≥ C(q) re-checked every trade; no trading on known outcomes.", "by design"],
  [19, "Ladder manipulation / inconsistency", "Each boundary is disputable; an inconsistent ladder voids the market (1/N) instead of picking a range.", "mitigated"],
  [20, "Fee attribution games", "depositFees only adds rewards; only correct resolvers / voters are paid; insurance top-up capped at one third.", "mitigated"],
];

export default function ThreatModelPage() {
  const count = (s: Status[]) => THREATS.filter((t) => s.includes(t[3])).length;
  return (
    <article>
      <DocHeader
        icon={ShieldCheck}
        eyebrow="Reference · Threat model"
        title="Adversaries, defenses, and what's still open"
        lead={
          <>
            Every adversary we model, how the code defends against it, and an honest status. The long form — with test names
            for every fix — is <C>docs/threat-model.md</C> in the repository.
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Adversaries modeled", value: String(THREATS.length) },
          { label: "Fixed / mitigated", value: String(count(["fixed", "mitigated", "by design"])), hint: "each with regression tests" },
          { label: "Partial", value: String(count(["partial"])), hint: "trust assumptions stated" },
          { label: "Open / deferred", value: String(count(["open", "deferred"])), hint: "committee seed · MEV" },
        ]}
      />

      <H2>The adversary table</H2>
      <DataTable
        columns={["#", "Threat", "Defense", "Status"]}
        mono={[0]}
        rows={THREATS.map(([n, t, d, s]) => [
          n,
          <span key="t" className="font-medium text-ink">{t}</span>,
          d,
          <span key="s" className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS[s]}`}>
            {s}
          </span>,
        ])}
      />

      <Callout tone="warn" title="Biggest open item: committee randomness">
        On Robinhood Chain (Arbitrum Orbit) <C>prevrandao</C> is the constant 1 and <C>blockhash</C> is weak, so the committee seed{" "}
        <C>keccak256(eventId, tier, blockhash(n−1), timestamp)</C> is predictable and the sequencer orders transactions.
        Chainlink VRF is not available on Robinhood Chain. Planned fix: seed from a block after the escalation plus
        committee-revealed salts (commit-reveal). Until then the authorized pool stays ≤ 7, so the committee is the whole pool
        and there is nothing to steer.
      </Callout>

      <H2>Cycle-impossibility proof</H2>
      <P>
        A composite&apos;s ID is <C>keccak256(op, canonicalOperands, window)</C> — a hash of its own definition, including its
        operand list. For a composite to reference itself, its operands would have to contain its own ID <em>before</em> that ID
        exists, which requires inverting keccak256. And <C>EventComposer</C> requires every operand to already exist in storage,
        so every edge points to a node created strictly earlier. No cycle of any length can be built — not bounded,{" "}
        <em>impossible</em>.
      </P>

      <H2>Terminal-state propagation</H2>
      <P>
        A voided primitive used to leave every composite above it reporting &ldquo;not yet resolved&rdquo; forever. The rule now
        applied to every operator, in order:
      </P>
      <DataTable
        columns={["Precedence", "Rule"]}
        mono={[0]}
        rows={[
          ["1", "A decisive short-circuit wins regardless of siblings (AND / BEFORE / WITHIN on any False; OR on any True)."],
          ["2", "Otherwise a genuinely pending sibling keeps the composite Unresolved — normal openness, not a stall."],
          ["3", "Otherwise a Voided (or Expired) sibling makes the composite Voided."],
          ["4", "Otherwise every operand is decided and the normal comparison applies."],
        ]}
      />

      <H2>Out of scope for the MVP</H2>
      <P>
        Cross-chain events, ZK proofs, a permissionless resolver marketplace with staking tokens, MEV protection, and full
        stake-weighted / VRF-selected arbitration. The bonded committee ladder is real progress toward the last one — not the
        final design.
      </P>
    </article>
  );
}
