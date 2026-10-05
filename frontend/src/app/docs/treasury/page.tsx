import { Coins } from "lucide-react";
import { C, Callout, DataTable, DocHeader, Flow, H2, H3, P, Panel, StatGrid, Steps, TwoCol } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Treasury & fee thirds — Novak Docs" };

function Third({ label, who, note, cls }: { label: string; who: string; note: string; cls: string }) {
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-3xl font-bold">⅓</p>
      <p className="mt-1 font-semibold">{label}</p>
      <p className="mt-1 text-sm opacity-90">{who}</p>
      <p className="mt-2 font-mono text-[11px] opacity-70">{note}</p>
    </div>
  );
}

export default function TreasuryPage() {
  return (
    <article>
      <DocHeader
        icon={Coins}
        eyebrow="Protocol · TreasuryVault"
        title="Every fee is split in thirds — and only the right answers get paid"
        lead="Markets don't pay a protocol wallet. They push their fees into the TreasuryVault, tagged with the events they settled on. When an event is decided, its fees are split three ways: the resolvers who reported the final outcome, the committee members who voted it (or an insurance reserve), and the treasury."
      />

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Third label="Resolvers" who="Split equally among resolvers whose observation matched the final outcome." note="claimResolverReward(eventId)" cls="border-violet-200 bg-violet-50 text-violet-900" />
        <Third label="Committee or insurance" who="Disputed: the deciding tier's members who voted the outcome. Undisputed: the insurance reserve." note="claimCommitteeReward(eventId)" cls="border-indigo-200 bg-indigo-50 text-indigo-900" />
        <Third label="Treasury" who="Protocol treasury (team multisig later), plus rounding dust." note="withdrawTreasury(to, amount)" cls="border-gray-200 bg-white text-ink" />
      </div>

      <StatGrid
        items={[
          { label: "Range-market fee", value: "1%", hint: "per trade (tradeFeeBps = 100)" },
          { label: "Yes/no market fee", value: "1%", hint: "of the losing pool at settlement (feeBps = 100)" },
          { label: "Max fee", value: "5%", hint: "MAX_FEE_BPS, enforced in each market" },
          { label: "Events per deposit", value: "≤16", hint: "MAX_EVENTS_PER_DEPOSIT" },
        ]}
      />

      <H2>Fees in, rewards out</H2>
      <Flow
        nodes={[
          { title: "Market settles", sub: "fees accrued" },
          { title: "depositFees(ids, amt)", sub: "tagged per event", tone: "violet" },
          { title: "Event decided", sub: "Finalized / Voided / Expired", tone: "violet" },
          { title: "allocate(id)", sub: "split into thirds", tone: "ink" },
          { title: "Pull claims", sub: "resolvers · committee", tone: "emerald" },
        ]}
      />
      <Steps
        items={[
          { title: "Deposit", body: <>A market calls <C>depositFees(eventIds, amount)</C>. The amount is split equally across the IDs. A composite ID is expanded one level into its primitive operands, so a market on &ldquo;NVDA up AND TSLA down&rdquo; pays the resolvers of both. Deeper nesting, unknown IDs and rounding go to the treasury.</> },
          { title: "Wait for the decision", body: <>Fees sit in <C>pendingFees[eventId]</C> until the event is Finalized, Voided or Expired.</> },
          { title: "Allocate", body: <><C>allocate(eventId)</C> is permissionless (the keeper calls it, and every claim calls it first). It snapshots the final outcome, how many resolvers observed it, and — if there was a dispute — how many members of the deciding tier voted it.</> },
          { title: "Claim", body: <>Each resolver or committee member calls the claim function and receives its equal share. The resolver node&apos;s rewards duty does this automatically.</> },
        ]}
      />

      <H2>The rules, case by case</H2>
      <DataTable
        columns={["Event ended…", "Resolver third", "Committee third", "Treasury third"]}
        rows={[
          ["Finalized, never disputed", "correct resolvers", "→ insurance reserve", "treasury"],
          ["Finalized by a committee", "correct resolvers", "deciding tier's correct voters, + a bonus of up to one more third from insurance", "treasury"],
          ["Finalized, but no resolver observed the final outcome", "→ treasury", "as above", "treasury"],
          ["Voided or Expired", "→ treasury", "→ treasury", "treasury (all of it)"],
        ]}
      />

      <H3>Why an insurance reserve?</H3>
      <P>
        Disputes are rare, so committee members would rarely be paid if they only earned from the fees of the event they
        judged — and a disputed event can have thin volume. The committee third of every <em>undisputed</em> event therefore
        fills an insurance reserve, and each later disputed event draws a bonus of up to one extra third from it. Honest
        committee work is paid even when the market behind it was small.
      </P>

      <H2>Worked example</H2>
      <Callout title="An NVDA range market with 6 ranges collects 6.00 USDG in trade fees">
        The market has 5 boundary events, so settlement deposits 1.20 USDG per event. Nobody disputed, and both resolvers
        reported every boundary correctly. Per event: 0.40 → resolvers (0.20 each), 0.40 → insurance reserve, 0.40 → treasury.
        Across the market: each resolver earns 1.00 USDG, insurance grows by 2.00, the treasury by 2.00.
      </Callout>

      <H2>The second inflow: dispute bonds</H2>
      <TwoCol
        left={
          <Panel title="ETH from disputes" accent>
            The vault is the DisputeManager&apos;s <C>treasury</C>. The treasury third of every losing committee bond, and ⅔ of a
            wrong disputer&apos;s bond, is credited to it. <C>sweepDisputeProceeds()</C> pulls that ETH in (the keeper calls it).
          </Panel>
        }
        right={
          <Panel title="Owner controls">
            The owner (the deployer today; a team multisig later) can spend the treasury and insurance balances —{" "}
            <C>withdrawTreasury</C>, <C>withdrawInsurance</C>, <C>withdrawEth</C> — each emitting an event. The owner can&apos;t
            touch resolver or committee pools.
          </Panel>
        }
      />

      <H2>Function reference</H2>
      <DataTable
        columns={["Function", "Who", "What"]}
        mono={[0]}
        rows={[
          ["depositFees(bytes32[] ids, uint256 amount)", "markets", "Pull USDG and attribute it to events."],
          ["allocate(bytes32 id)", "anyone", "Split a decided event's pending fees into thirds."],
          ["claimResolverReward(bytes32 id)", "resolvers", "Collect the resolver share (runs allocate first)."],
          ["claimCommitteeReward(bytes32 id)", "committee members", "Collect the committee share (runs allocate first)."],
          ["claimableResolverReward / claimableCommitteeReward(id, who)", "view", "What an address can claim now."],
          ["pendingFees(id) · getRewards(id)", "view", "Undivided fees; the per-event snapshot and pools."],
          ["treasuryBalance() · insuranceReserve()", "view", "Protocol balances."],
          ["sweepDisputeProceeds()", "anyone", "Pull credited dispute ETH from the DisputeManager."],
          ["withdrawTreasury · withdrawInsurance · withdrawEth", "owner", "Spend protocol balances."],
        ]}
      />
      <P className="text-sm text-gray-500">
        The vault is protocol infrastructure, not a consumer: it reads the Registry, Composer and DisputeManager to work out who
        is paid. Markets only push fees into it and still read outcomes through the Event Bus.
      </P>
    </article>
  );
}
