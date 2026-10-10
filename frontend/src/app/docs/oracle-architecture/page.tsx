import Link from "next/link";
import { AlertOctagon, CheckCircle2, Gavel, Layers, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { C, Callout, DataTable, DocHeader, H2, P } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Oracle architecture — Novak Docs" };

const LADDER = [
  {
    icon: Users,
    stage: "Stage 1",
    title: "Resolver quorum",
    where: "EventRegistry",
    body: "Authorized resolvers each submit an outcome plus an evidence hash. When the quorum submits the identical payload, it becomes the proposed outcome and the dispute window opens.",
    tone: "border-violet-200 bg-violet-50/60",
    chip: "bg-violet-600",
  },
  {
    icon: Gavel,
    stage: "Stage 2",
    title: "Bonded committees",
    where: "DisputeManager",
    body: "Anyone can dispute by posting a bond. A Tier-1 committee (≤7 resolvers) needs 66% agreement; failing that, Tier 2 (≤15) decides. Members are drawn by commit-reveal and bonded.",
    tone: "border-amber-200 bg-amber-50/60",
    chip: "bg-amber-500",
  },
  {
    icon: RotateCcw,
    stage: "Stage 3",
    title: "VOID, never guess",
    where: "EventBus → every market",
    body: "If Tier 2 can't converge either, the event is permanently Voided. Every market reading it refunds — range markets redeem at 1/N per share. No token vote ever picks an answer.",
    tone: "border-emerald-200 bg-emerald-50/60",
    chip: "bg-emerald-600",
  },
];

export default function OracleArchitecturePage() {
  return (
    <article>
      <DocHeader
        icon={ShieldCheck}
        eyebrow="Architecture · Oracle design"
        title="Chainlink tells your contract the price. Novak tells it what happened."
        lead="Novak is an event oracle and dispute layer for tokenized stocks on Robinhood Chain. Facts about stock tokens — price at a time, corporate actions, trading halts, the Fed rate — are resolved once, can be challenged, and are served to every market from one read surface."
      />

      <H2>How an answer is decided</H2>
      <P>Three stages, each only reached if the one before it is challenged or fails to agree.</P>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {LADDER.map((s, i) => (
          <li key={s.title} className={`relative rounded-2xl border p-5 ${s.tone}`}>
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${s.chip}`}>
                <s.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500">{s.stage}</span>
            </div>
            <p className="mt-3 text-base font-semibold text-ink">{s.title}</p>
            <p className="font-mono text-[11px] text-violet-700">{s.where}</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{s.body}</p>
            {i < LADDER.length - 1 && (
              <span className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-200 bg-white text-xs text-violet-500 md:flex">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <H2>Side by side</H2>
      <P>
        How Novak compares with a price oracle and an optimistic oracle with token voting is laid out on the{" "}
        <Link href="/docs/architecture#side-by-side">Architecture</Link> page, next to the five layers.
      </P>

      <H2>Security properties</H2>
      <DataTable
        columns={["Property", "Novak", "Why it holds"]}
        rows={[
          ["Whale / bribery attack on disputes", "No governance token to buy", "Disputes are decided by bonded resolver committees, not by token-weighted votes."],
          ["Non-convergence", "Event VOIDED → full refunds", "Tier 2 failing to reach 66% voids the event; Voided propagates through every composite."],
          ["Consumer coupling", "Pull-only through the EventBus", "Markets hold only Settlement / IEventBus — enforced by a regression test per consumer."],
          ["Committee selection", "Commit-reveal seed", "Members commit and reveal salts; the seed is their XOR, so no single party picks the committee."],
          ["Logic composition", "On-chain EventComposer", "AND / OR / NOT / BEFORE / WITHIN with canonical IDs, so every venue shares one composite answer."],
        ]}
      />

      <Callout tone="ok" title="What this means for a market">
        Your market never runs an oracle, posts a bond or arbitrates a dispute. It checks <C>getAvailability(eventId)</C>: Pending
        → keep waiting, Available → settle on <C>readOutcome</C>, Voided → refund. See{" "}
        <Link href="/docs/integrate">Integrate your market</Link> and <Link href="/docs/disputes">Disputes &amp; committees</Link>.
      </Callout>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/docs/architecture", icon: Layers, t: "Architecture", d: "Sources, resolvers and contracts" },
          { href: "/docs/disputes", icon: AlertOctagon, t: "Dispute ladder", d: "Bonds, tiers and the VOID floor" },
          { href: "/docs/threat-model", icon: CheckCircle2, t: "Threat model", d: "Adversaries and known limits" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="link-plain group rounded-2xl border border-violet-100 bg-white p-4 transition hover:border-violet-300 hover:shadow-[0_12px_30px_-22px_rgba(109,74,255,0.7)]">
            <l.icon className="h-4 w-4 text-violet-600" />
            <p className="mt-2 font-semibold text-ink group-hover:text-violet-700">{l.t} →</p>
            <p className="text-xs text-gray-500">{l.d}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
