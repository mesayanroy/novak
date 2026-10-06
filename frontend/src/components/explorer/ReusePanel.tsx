"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { decodePriceAtSpec, selectPriceLadder, SOURCES, sourceId, type Hex, type KnownEvent } from "@novakoracle/sdk";
import { Check, Copy, Recycle, Store } from "lucide-react";
import { deployment } from "@/lib/addresses";
import { useEvents, useNovakClient, type EventNode } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { CodeBlock } from "@/components/CodeBlock";
import { ConnectButton } from "@/components/ConnectButton";

/** Registry statuses where nobody has decided the event yet. */
const UNDECIDED = new Set([1, 2, 3]);

export const toKnown = (n: EventNode): KnownEvent | null =>
  n.kind === "primitive" && n.spec && n.status !== undefined ? { eventId: n.id, spec: n.spec, status: Number(n.status), blockNumber: 0n } : null;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:border-violet-400"
    >
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {ok ? "Copied" : label}
    </button>
  );
}

/**
 * "Reuse this event": an event is observed, disputed and finalized once, then
 * any number of markets read it. This panel hands an integrator everything
 * needed to point their own market at THIS event instead of creating a
 * duplicate: the id, ready-to-paste code (NovakConsumer / CTF adapter / SDK),
 * the rest of its range ladder, and a one-click yes/no market.
 */
export function ReusePanel({ node }: { node: EventNode }) {
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const { run, pending, error } = useTx();
  const { data: events } = useEvents();
  const [market, setMarket] = useState<Hex | null>(null);

  const undecided = node.status !== undefined && UNDECIDED.has(Number(node.status));
  const opensAt = Number(node.spec?.openTimestamp ?? 0n);
  const canOpenMarket = undecided && opensAt > Math.floor(Date.now() / 1000) + 300;

  // If this is a "price ≥ X at T" event, the rest of its ladder (same feed, same T).
  const ladder = useMemo(() => {
    if (!node.spec || node.spec.sourceId.toLowerCase() !== sourceId(SOURCES.priceAt).toLowerCase()) return [];
    try {
      const s = decodePriceAtSpec(node.spec.spec);
      const known = (events ?? []).map(toKnown).filter((e): e is KnownEvent => e !== null);
      return selectPriceLadder(known, { feed: s.feed, at: s.at });
    } catch {
      return [];
    }
  }, [node.spec, events]);
  const ladderIds = ladder.map((r) => r.eventId);

  const bus = deployment?.eventBus ?? "0x…";
  const tabs = [
    {
      id: "sol",
      label: "Solidity",
      language: "solidity",
      code: `import { NovakConsumer } from "novak/contracts/integrations/NovakConsumer.sol";

contract MyMarket is NovakConsumer {
    bytes32 public constant EVENT_ID = ${node.id};

    constructor() NovakConsumer(${bus}) {}

    function deposit(bool yes) external payable whenNovakPending(EVENT_ID) { /* … */ }
    function resolve() external { _settleWithNovak(EVENT_ID); }

    function _onNovakResolved(bytes32, bool yes) internal override { /* pay the winning side */ }
    function _onNovakVoided(bytes32) internal override { /* refund everyone */ }
}`,
    },
    {
      id: "ctf",
      label: "CTF",
      language: "ts",
      code: `// Polymarket-style venue: NovakCTFAdapter is the oracle of your CTF condition.
const tx = await novak.ctfPrepareBinary(adapter, "${node.id}", account); // slot 0 = YES
const questionId = await novak.ctfQuestionId(adapter, "${node.id}");
// … trade the condition's outcome tokens as usual …
if (await novak.ctfCanResolve(adapter, questionId)) {
  await novak.ctfResolve(adapter, questionId, account); // voided ⇒ every slot pays equally
}`,
    },
    {
      id: "sdk",
      label: "Off-chain",
      language: "ts",
      code: `import { NovakClient, getDeployment } from "@novakoracle/sdk";

const novak = new NovakClient(publicClient, undefined, getDeployment(46630));
const r = await novak.waitForOutcome("${node.id}");
r.voided ? refundAll() : settle(r.outcome);`,
    },
    ...(ladder.length > 1
      ? [
          {
            id: "range",
            label: `Ladder (${ladder.length})`,
            language: "ts",
            code: `// The full "≥ X at T" ladder this event belongs to — reuse it for a range market.
const boundaries = [
${ladderIds.map((id) => `  "${id}",`).join("\n")}
];
// LMSR range market (n+1 buckets):
await novak.createDistributionMarket(question, boundaries, closesAt, liquidityB, account);
// …or a Conditional Tokens range condition:
await novak.ctfPrepareRange(adapter, boundaries, account);`,
          },
        ]
      : []),
  ];

  const openMarket = () =>
    client &&
    address &&
    run("Opening a market", async (wait) => {
      const tx = await client.createMarket(node.id, BigInt(opensAt), node.title.slice(0, 280), address);
      await wait(tx);
      setMarket(await client.getCreatedMarketId(tx));
    });

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-white p-5 shadow-[0_10px_30px_-24px_rgba(109,74,255,0.5)]">
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
        <Recycle className="h-3.5 w-3.5" /> Reuse this event
      </p>
      <p className="mt-2 text-sm text-gray-700">
        Already asked, observed and disputable — point your market at it instead of creating a duplicate. Same answer, same
        dispute ladder, no extra resolver work.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={node.id} label="Copy event ID" />
        {ladder.length > 1 && <CopyButton text={JSON.stringify(ladderIds)} label={`Copy ladder (${ladder.length})`} />}
        {canOpenMarket &&
          (market ? (
            <Link href={`/markets/${market}`} className="link-plain inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
              <Store className="h-3.5 w-3.5" /> Open the market →
            </Link>
          ) : isConnected ? (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={openMarket}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Store className="h-3.5 w-3.5" /> {pending ?? "Open a yes/no market on it"}
            </button>
          ) : (
            <ConnectButton />
          ))}
      </div>
      {error && <p className="mt-2 font-mono text-[11px] text-rose-700">{error}</p>}
      {!undecided && (
        <p className="mt-3 text-xs text-gray-500">
          Already decided — new markets can&apos;t trade on it, but any contract can still read its final answer.
        </p>
      )}

      {ladder.length > 1 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">Its ladder · same feed, same T</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ladder.map((r) => (
              <Link
                key={r.eventId}
                href={`/events/${r.eventId}`}
                className={`link-plain rounded-full px-2.5 py-1 font-mono text-[11px] ring-1 ${
                  r.eventId.toLowerCase() === node.id.toLowerCase() ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-gray-700 ring-gray-200 hover:ring-violet-300"
                }`}
              >
                ≥ ${(Number(r.threshold) / 1e8).toLocaleString()}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 min-w-0">
        <CodeBlock variant="dark" tabs={tabs} />
      </div>
    </section>
  );
}
