import { EventStatusPill } from "@/components/StatusPill";
import { EventStatus } from "@novak/sdk";

export const metadata = { title: "Event lifecycle — Novak Docs" };

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-4">
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <path d="M0 8h18" stroke="#A19D97" strokeWidth="1.4" />
        <path d="M14 3l5 5-5 5" stroke="#A19D97" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}

export default function LifecyclePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Event lifecycle</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create → Open → … → terminal</h1>

      <p className="mt-6 text-gray-700">
        This is the actual <code className="font-mono text-sm">EventRegistry</code> /{" "}
        <code className="font-mono text-sm">DisputeManager</code> state machine as implemented — not the
        earlier single-arbitrator design. Arbitration is a bonded, two-tier committee ladder that never
        escalates to a token-weighted vote.
      </p>

      <div className="mt-8 flex flex-col border border-gray-300 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-gray-500">CREATE</span>
          <Arrow />
          <EventStatusPill status={EventStatus.Open} />
          <Arrow />
          <EventStatusPill status={EventStatus.ObservationsSubmitted} />
          <Arrow />
          <EventStatusPill status={EventStatus.ProposedOutcome} />
        </div>

        <Arrow label="dispute window elapses, undisputed" />
        <EventStatusPill status={EventStatus.Finalized} />

        <div className="my-4 border-t border-dashed border-gray-300 pt-4">
          <p className="mb-3 text-sm text-gray-600">
            …or, if disputed (or the quorum never converged):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusPill status={EventStatus.Disputed} tier={1} />
            <Arrow label="≥66% agree" />
            <EventStatusPill status={EventStatus.Finalized} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EventStatusPill status={EventStatus.Disputed} tier={1} />
            <Arrow label="no 66% in 1h" />
            <EventStatusPill status={EventStatus.Disputed} tier={2} />
            <Arrow label="≥66% agree" />
            <EventStatusPill status={EventStatus.Finalized} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EventStatusPill status={EventStatus.Disputed} tier={2} />
            <Arrow label="still no 66% in 2h" />
            <EventStatusPill status={EventStatus.Voided} />
          </div>
        </div>

        <div className="border-t border-dashed border-gray-300 pt-4">
          <p className="mb-3 text-sm text-gray-600">…or, if nobody ever observes it:</p>
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusPill status={EventStatus.Open} />
            <Arrow label="observationDeadline passes, zero observations" />
            <EventStatusPill status={EventStatus.Expired} />
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Committee escalation numbers</h2>
      <p className="mt-3 text-gray-700">
        Every number below is a stated MVP constant from{" "}
        <code className="font-mono text-sm">DisputeManager.sol</code>, not a final economic design — see{" "}
        <code className="font-mono text-sm">docs/protocol-spec.md</code>.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border border-gray-300 p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Tier 1</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-gray-700">
            <li>Committee: up to 7 resolvers</li>
            <li>Bond per vote: 0.03 ETH</li>
            <li>Window: 1 hour</li>
            <li>Agreement bar: ≥66% of committee size</li>
          </ul>
        </div>
        <div className="border border-gray-300 p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Tier 2</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-gray-700">
            <li>Committee: up to 15 resolvers</li>
            <li>Bond per vote: 0.08 ETH</li>
            <li>Window: 2 hours</li>
            <li>Agreement bar: ≥66% of committee size</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm text-gray-600">
        See{" "}
        <a href="/docs/disputes" className="text-ink">
          Dispute &amp; finalization
        </a>{" "}
        for the bond that opens a dispute versus the bond that casts a committee vote, and why VOID is
        a hard floor, never a retry loop or a vote.
      </p>
    </article>
  );
}
