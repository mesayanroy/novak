import { Scale } from "lucide-react";
import { C, Callout, DataTable, DocHeader, Flow, H2, H3, P, Panel, StatGrid, Steps, TwoCol } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Disputes & committees — Novak Docs" };

export default function DisputesPage() {
  return (
    <article>
      <DocHeader
        icon={Scale}
        eyebrow="Protocol · Disputes & committees"
        title="A bonded committee ladder — never a token vote"
        lead={
          <>
            Any proposed outcome can be challenged. A challenge doesn&apos;t go to whoever holds the most governance tokens:
            it goes to a randomly drawn committee of resolvers who must re-check the source and put money on their answer.
            If two committees in a row can&apos;t agree, the event is <C>Voided</C> and every market built on it refunds.
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Dispute bond", value: "1 unit", hint: "0.01 ETH default · 0.0005 on testnet" },
          { label: "Tier 1", value: "≤7 · 1 h", hint: "3 units per vote" },
          { label: "Tier 2", value: "≤15 · 2 h", hint: "8 units per vote" },
          { label: "To decide", value: "66%", hint: "of committee SIZE, not of votes cast" },
        ]}
      />

      <Callout tone="ok" title="Try it live">
        The <a href="/disputes">Dispute Center</a> lists every event that&apos;s open to challenge or in committee on Robinhood
        Chain testnet. File a dispute from your wallet, watch the committee vote in real time, and withdraw returned bonds.
        Every market page shows the same panel for the events it settles on.
      </Callout>

      <H2>The ladder</H2>
      <Flow
        nodes={[
          { title: "Proposed outcome", sub: "quorum agreed" },
          { title: "Dispute", sub: "1 bond unit, in window", tone: "violet" },
          { title: "Tier 1", sub: "≤7 resolvers · 1 h", tone: "violet" },
          { title: "Tier 2", sub: "≤15 resolvers · 2 h", tone: "violet" },
          { title: "Finalized or Voided", sub: "no Tier 3", tone: "ink" },
        ]}
      />

      <H2>Two ways into a dispute</H2>
      <TwoCol
        left={
          <Panel title="Challenge — dispute(eventId)" accent>
            The event is <C>ProposedOutcome</C> and its dispute window (set per event, e.g. 10 minutes) is still open. The
            disputer sends exactly <C>DISPUTE_BOND</C> (one bond unit). The event moves to <C>Disputed</C> and Tier 1 opens.
          </Panel>
        }
        right={
          <Panel title="Split quorum — escalateNonConvergence(eventId)">
            Resolvers disagreed and no answer reached the quorum by the observation deadline. Anyone (in practice the keeper)
            escalates it — no bond — and Tier 1 opens with no original proposal to defend.
          </Panel>
        }
      />

      <H2>Step by step</H2>
      <Steps
        items={[
          { tag: "DisputeManager", title: "Committee drawn", body: "Up to 7 authorized resolvers are drawn for Tier 1 (the whole pool if it is smaller). The draw is seeded from block data and the event ID." },
          { tag: "1 hour", title: "Members vote with a bond", body: <>Each member calls <C>submitTier1Vote(eventId, outcome)</C> with the Tier-1 bond (3 units). Resolver nodes do this automatically: they re-run the same adapter and vote what they observe.</> },
          { tag: "instant", title: "66% decides", body: <>The moment one side reaches 66% of the committee size, the tier resolves: the Registry finalizes that outcome (<C>finalizeFromDispute</C>) and bonds are settled.</> },
          { tag: "keeper", title: "No decision → Tier 2", body: <>If the hour ends without 66%, <C>escalateTier2</C> refunds every Tier-1 vote bond in full and draws up to 15 resolvers with the Tier-2 bond (8 units) and a 2-hour window.</> },
          { tag: "floor", title: "Still no decision → VOID", body: <><C>voidAfterTier2Timeout</C> marks the event permanently <C>Voided</C>. All Tier-2 bonds and the disputer&apos;s bond are refunded. Nothing escalates further.</> },
        ]}
      />

      <H2>How many votes decide?</H2>
      <P>
        The rule in code is <C>votes × 100 ≥ committeeSize × 66</C>. It counts the committee&apos;s size, not how many voted,
        so members who stay silent can&apos;t let a small group decide.
      </P>
      <DataTable
        columns={["Authorized pool", "Tier-1 committee", "Votes to decide", "Tier-2 committee", "Votes to decide"]}
        mono={[0, 1, 2, 3, 4]}
        rows={[
          ["2", "2", "2", "2", "2"],
          ["3 (today)", "3", "2", "3", "2"],
          ["5", "5", "4", "5", "4"],
          ["7", "7", "5", "7", "5"],
          ["10", "7", "5", "10", "7"],
          ["15+", "7", "5", "15", "10"],
        ]}
      />

      <H2>Where the bonds go</H2>
      <P>When a tier decides, everyone who voted with the decision gets their bond back. The losing side&apos;s bonds are split in thirds:</P>
      <DataTable
        columns={["Third", "Goes to"]}
        rows={[
          ["⅓", "Burned (sent to 0x…dEaD)"],
          ["⅓", "The protocol treasury — the TreasuryVault, which sweeps it in with sweepDisputeProceeds()"],
          ["⅓", "Shared equally by the members who voted with the decision (rounding dust goes to the treasury)"],
        ]}
      />
      <H3>The disputer&apos;s bond</H3>
      <DataTable
        columns={["Committee decides…", "Disputer gets"]}
        rows={[
          ["against the original proposal (the disputer was right)", "their bond back in full"],
          ["the same as the original proposal (the disputer was wrong)", "nothing: ⅓ burned, ⅔ to the treasury"],
          ["nothing — event Voided", "their bond back in full"],
        ]}
      />
      <H3>Worked example</H3>
      <Callout title="Tier 1, 7 members: 5 vote TRUE, 2 vote FALSE">
        5 ≥ 4.62, so TRUE is decided. Losing pool = 2 × 0.03 = 0.06 ETH → 0.02 burned, 0.02 to the treasury, 0.02 shared by the
        5 winners = 0.004 each. Each winner withdraws 0.03 + 0.004 = <strong>0.034 ETH</strong> (default unit; on testnet
        every figure is 20× smaller). If the original proposal was
        FALSE, the disputer also gets their 0.01 back.
      </Callout>
      <P>
        On top of the bonds, the committee is paid from <strong>market fees</strong>: the TreasuryVault&apos;s committee third
        for that event goes to the deciding tier&apos;s members who voted the final outcome. See{" "}
        <a href="/docs/treasury">Treasury &amp; fee thirds</a>.
      </P>

      <H2>Pull payments</H2>
      <P>
        DisputeManager never pushes ETH to members inside a vote. Everything owed is credited to{" "}
        <C>pendingWithdrawals[address]</C> and collected with <C>withdraw()</C>, so a contract that reverts on receiving ETH
        can&apos;t freeze a dispute. Resolver nodes withdraw automatically.
      </P>

      <H2>Constants</H2>
      <Callout title="Bonds come from one deploy-time unit">
        <C>DISPUTE_BOND</C> is the unit; Tier-1 and Tier-2 vote bonds are always 3× and 8× it, so the escalation economics are
        identical at any scale. The default unit is 0.01 ETH. The Robinhood Chain testnet deployment uses 0.0005 ETH so three
        faucet-funded resolvers can actually post committee bonds — a full Tier-1 dispute costs each of them under 0.002 ETH.
      </Callout>
      <P>Read directly from <C>contracts/DisputeManager.sol</C>.</P>
      <DataTable
        columns={["Constant", "Value", "Meaning"]}
        mono={[0, 1]}
        rows={[
          ["DISPUTE_BOND", "1 unit · 0.01 ETH default · 0.0005 testnet", "Bond to challenge a proposed outcome."],
          ["TIER1_BOND", "3 units · 0.03 / 0.0015 ETH", "Bond per Tier-1 vote."],
          ["TIER1_COMMITTEE_SIZE", "7", "Maximum Tier-1 members (the whole pool if smaller)."],
          ["TIER1_WINDOW", "1 hour", "Time Tier 1 has to decide."],
          ["TIER2_BOND", "8 units · 0.08 / 0.004 ETH", "Bond per Tier-2 vote."],
          ["TIER2_COMMITTEE_SIZE", "15", "Maximum Tier-2 members."],
          ["TIER2_WINDOW", "2 hours", "Time Tier 2 has to decide."],
          ["AGREEMENT_BPS", "66", "Percent of committee size needed to decide."],
        ]}
      />
      <DataTable
        caption="Functions"
        columns={["Function", "Who", "When"]}
        mono={[0]}
        rows={[
          ["dispute(eventId)", "anyone, DISPUTE_BOND", "ProposedOutcome, inside the dispute window"],
          ["escalateNonConvergence(eventId)", "anyone", "observation deadline passed without quorum"],
          ["submitTier1Vote / submitTier2Vote(eventId, outcome)", "drawn committee members, with the tier bond", "inside the tier window"],
          ["escalateTier2(eventId)", "anyone", "Tier-1 window over, no 66%"],
          ["voidAfterTier2Timeout(eventId)", "anyone", "Tier-2 window over, no 66%"],
          ["withdraw()", "anyone owed ETH", "any time"],
          ["getCommittee · getVote · getTierTally · getCaseSummary", "views", "any time"],
        ]}
      />

      <H2>Drawing a committee: commit-reveal</H2>
      <P>
        While the resolver pool fits in a tier (≤ 7 for Tier 1, ≤ 15 for Tier 2), the committee is the whole pool and voting
        starts at once. Once the pool is larger, the tier first runs a two-step draw that no single party — the sequencer
        included — can predict or steer:
      </P>
      <Steps
        items={[
          { tag: "10 min", title: "Commit", body: <>Each authorized resolver calls <C>commitSeed(eventId, keccak256(eventId, tier, resolver, salt))</C>. Nodes derive the salt from their own signature, so they can always reveal it later.</> },
          { tag: "10 min", title: "Reveal", body: <>Each committer calls <C>revealSeed(eventId, salt)</C>. The salts are XOR-combined, so the order of reveals doesn&apos;t matter.</> },
          { tag: "anyone", title: "Draw", body: <><C>drawCommittee(eventId)</C> seeds the draw with the combined salts. Committers that never revealed are excluded — withholding can only remove yourself. The voting window starts here.</> },
        ]}
      />

      <H2>Known limitations</H2>
      <Callout tone="warn">
        Bonds are flat (no staking or reputation yet), and the contracts are unaudited. Committee selection is commit-reveal
        (above) rather than VRF, which isn&apos;t available on Robinhood Chain; its one residual is a last revealer withholding,
        which only removes themselves from the draw. If nobody reveals at all, the draw falls back to block data so a dispute
        can never stall. See the <a href="/docs/threat-model">threat model</a>.
      </Callout>
    </article>
  );
}
