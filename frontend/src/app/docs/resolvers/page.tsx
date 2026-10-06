import { Cpu } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { C, Callout, DataTable, DocHeader, Flow, H2, H3, P, StatGrid, Steps } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Resolver network — Novak Docs" };

export default function ResolversPage() {
  return (
    <article>
      <DocHeader
        icon={Cpu}
        eyebrow="Protocol · Resolver network"
        title="Independent resolvers turn sources into facts"
        lead="A resolver is a small Node.js daemon holding one authorized key. It finds Novak events on-chain, reads the real source for each one, submits what it saw with an evidence hash, sits on dispute committees, and gets paid from market fees when it was right."
      />

      <StatGrid
        items={[
          { label: "Source adapters", value: "4", hint: "price-at · corporate action · trading status · Fed rate" },
          { label: "Duties per node", value: "5", hint: "discover · resolve · vote · keep · claim" },
          { label: "Quorum", value: "N-of-M", hint: "exact match of the outcome payload" },
          { label: "Live today", value: "3", hint: "authorized resolvers · quorum 2 of 3 (team-run)" },
        ]}
      />

      <H2>What one resolver does</H2>
      <Flow
        nodes={[
          { title: "Discover", sub: "EventCreated logs" },
          { title: "Observe", sub: "adapter reads mainnet", tone: "violet" },
          { title: "Submit", sub: "outcome + evidence hash", tone: "violet" },
          { title: "Vote", sub: "if drawn onto a committee", tone: "violet" },
          { title: "Claim", sub: "TreasuryVault thirds", tone: "emerald" },
        ]}
      />
      <DataTable
        columns={["Duty", "What it does", "Runs on", "Code"]}
        mono={[3]}
        rows={[
          ["Discovery", "Scans the Registry's EventCreated and the Composer's CompositeEventCreated logs from the deployment's startBlock, in chunks that halve on RPC limits.", "every node", "node/discovery.ts"],
          ["Resolve", "For each open event it hasn't answered: decode the spec, run the matching adapter, submitObservation(outcome, evidenceHash). Abstains when the adapter abstains.", "every node", "node/resolve.ts"],
          ["Committee voting", "For each Disputed event where this node was drawn onto the active tier: re-observe with the same adapter and vote, posting the tier bond.", "every node (RESOLVER_VOTER, default on)", "node/voter.ts"],
          ["Keeper", "Pokes every permissionless transition: finalize, expire, escalateNonConvergence, escalateTier2, voidAfterTier2Timeout, tryResolve, settle markets, vault allocate / sweep, withdraw.", "one node (RESOLVER_KEEPER=true)", "node/keeper.ts"],
          ["Rewards", "Claims this node's resolver third and committee third from the TreasuryVault (claims also run allocate).", "every node", "node/rewards.ts"],
          ["Evidence server", "GET /health and GET /evidence/:hash — the full JSON behind each evidence hash.", "every node (RESOLVER_HTTP_PORT)", "node/server.ts"],
        ]}
      />

      <H2>Source adapters</H2>
      <P>
        An event names its source by <C>sourceId = keccak256(name)</C>. Every adapter is deterministic — all honest
        resolvers reading the same source for the same spec produce the same answer and the same evidence hash — and{" "}
        <strong>abstains</strong> (submits nothing) rather than guess.
      </P>
      <DataTable
        columns={["Source name", "Question", "Reads", "Abstains when"]}
        mono={[0]}
        rows={[
          [
            "chainlink.price-at.v1",
            "Feed F ≥ / ≤ threshold X at time T? (v2, occurredAt = T)",
            "Chainlink AggregatorV3 on mainnet; binary search for the latest round with updatedAt ≤ T",
            "T hasn't passed on mainnet yet; the round at T is older than maxStaleness (stock feeds hold the last price off-hours); T predates the current phase",
          ],
          [
            "rh.corporate-action.v1",
            "Stock token S had a multiplier change ≥ N bps take effect in [start, end]? (v2)",
            "ERC-8056 UIMultiplierUpdated(old, new, effectiveAt) logs on mainnet",
            "the window hasn't ended and no qualifying change has taken effect yet",
          ],
          [
            "rh.trading-status.v1",
            "Stock token S is NOT tradable in session X when observed? (v1)",
            "Robinhood asset registry (api.robinhood.com/rhj/assets), tradingCapabilities",
            "the API is unreachable",
          ],
          [
            "macro.fomc.v1",
            "Fed funds target upper bound on day D ≥ / ≤ X bps? (v2, occurredAt = D)",
            "FRED series DFEDTARU (public CSV, no key)",
            "FRED hasn't published day D yet",
          ],
        ]}
      />
      <Callout title="Why logs, not historical state?">
        The public Robinhood Chain mainnet RPC is not an archive node — historical <C>eth_call</C> fails. Adapters use
        immutable logs (multiplier changes) and Chainlink&apos;s own round history instead, which any node can re-read
        later to check an answer.
      </Callout>

      <H2>Quorum: how observations become an outcome</H2>
      <Steps
        items={[
          { title: "Window opens", body: <>Observations are rejected before the event&apos;s <C>openTimestamp</C> and after its <C>observationDeadline</C>. Only authorized resolvers can submit, once each.</> },
          { title: "Each resolver submits", body: <><C>submitObservation(eventId, outcomeData, evidenceHash)</C>. Version-2 payloads are <C>abi.encode(bool, uint64 occurredAt)</C> and <C>occurredAt</C> can&apos;t be in the future. The Registry records each resolver&apos;s boolean for rewards.</> },
          { title: "Quorum reached", body: <>When <C>quorumThreshold</C> resolvers submitted the <em>identical</em> payload (same hash), that payload becomes the proposed outcome and the dispute window starts.</> },
          { title: "Final, or escalated", body: <>No dispute in the window → the keeper calls <C>finalize</C>. Quorum never reached by the deadline (a split) → <C>escalateNonConvergence</C> sends it to a committee. Nobody observed at all → <C>expire</C>.</> },
        ]}
      />

      <H2>Evidence</H2>
      <P>
        Each observation carries <C>evidenceHash = keccak256(canonical JSON)</C> of what the resolver read — feed, round ID,
        answer, timestamps, or the matched log. The node keeps the JSON and serves it at <C>/evidence/:hash</C>, so a
        disputer (or a judge) can see exactly what was observed. Because the JSON is canonical, honest resolvers produce the
        same hash.
      </P>

      <H2>Getting paid</H2>
      <P>
        Every market fee is attributed to the events it settled on. Once an event is decided, the TreasuryVault gives one
        third to the resolvers whose recorded boolean matches the final outcome, split equally. Resolvers who were wrong — or
        silent — get nothing from that event. See <a href="/docs/treasury">Treasury &amp; fee thirds</a>.
      </P>

      <H2>Run a resolver</H2>
      <H3>Configuration</H3>
      <DataTable
        columns={["Variable", "Default", "Meaning"]}
        mono={[0, 1]}
        rows={[
          ["RESOLVER_PRIVATE_KEY", "—", "The authorized resolver key (required). Needs testnet ETH for gas and committee bonds."],
          ["NOVAK_CHAIN_ID", "46630", "Chain the contracts are on (31337 for local anvil)."],
          ["RPC_URL_ROBINHOOD_TESTNET", "public testnet RPC", "Where observations are written."],
          ["RESOLVER_SOURCE_RPC_URL", "public mainnet RPC", "Where sources are read. Use an Alchemy URL in production — the public one is rate-limited."],
          ["RESOLVER_ID", "resolver", "Name in logs and /health."],
          ["RESOLVER_KEEPER", "false", "Exactly one node should set true."],
          ["RESOLVER_VOTER", "true", "Vote when drawn onto a committee."],
          ["RESOLVER_HTTP_PORT", "0 (off)", "Port for /health and /evidence/:hash."],
          ["RESOLVER_POLL_INTERVAL_MS", "15000", "Loop interval."],
          ["RESOLVER_LOG_CHUNK", "500000", "Initial block range per getLogs call."],
        ]}
      />
      <H3>Start it</H3>
      <CodeBlock
        label="terminal"
        code={`pnpm install
pnpm --filter @novakoracle/sdk build          # the resolver imports the SDK
pnpm --filter novak-resolver build      # start runs the compiled dist/
RESOLVER_PRIVATE_KEY=0x… RESOLVER_ID=r1 RESOLVER_HTTP_PORT=8787 \\
  pnpm --filter novak-resolver start

# check the live sources it will read
pnpm --filter novak-resolver probe`}
      />
      <Callout tone="warn" title="Becoming a resolver">
        A key must be authorized on the Registry (<C>setResolverAuthorization</C>, owner-only today) before its observations
        count. There is no staking token: resolvers post flat ETH bonds when they vote in a dispute. Committees are drawn from
        the authorized pool; above the tier size they&apos;re drawn by commit-reveal, which every node takes part in automatically.
      </Callout>
    </article>
  );
}
