"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { ChevronDown, Gavel, Wallet } from "lucide-react";
import { Availability, disputeManagerAbi, EventStatus } from "@novakoracle/sdk";
import { deployment } from "@/lib/addresses";
import { useEvents, type EventNode } from "@/lib/novak";
import { usePendingWithdrawal } from "@/lib/disputes";
import { useTx } from "@/lib/useTx";
import { activeChain } from "@/lib/wagmi";
import { DisputePanel } from "@/components/disputes/DisputePanel";
import { EventStatusPill } from "@/components/StatusPill";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { cn } from "@/lib/utils";

const eth = (v?: bigint) => (v === undefined ? "…" : `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`);

function Row({ e, defaultOpen }: { e: EventNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <li className="rounded-2xl border border-gray-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{e.title}</span>
          <span className="block font-mono text-[10px] text-gray-400">
            {e.source} · {e.id.slice(0, 10)}…
          </span>
        </span>
        <span className="flex flex-none items-center gap-2">
          {e.status !== undefined && <EventStatusPill status={e.status} />}
          <ChevronDown className={cn("h-4 w-4 text-gray-400 transition", open && "rotate-180 text-violet-600")} />
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3">
          <DisputePanel eventId={e.id} />
        </div>
      )}
    </li>
  );
}

function Group({ title, hint, items, openFirst = 0, limit }: { title: string; hint: string; items: EventNode[]; openFirst?: number; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">
          {title} <span className="font-mono text-sm text-gray-400">({items.length})</span>
        </h2>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <ul className="mt-3 space-y-2">
        {shown.map((e, i) => (
          <Row key={e.id} e={e} defaultOpen={i < openFirst} />
        ))}
      </ul>
      {limit && items.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-semibold text-violet-700 hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function WithdrawStrip() {
  const { address } = useAccount();
  const { data: owed } = usePendingWithdrawal(address);
  const { writeContractAsync } = useWriteContract();
  const { run, pending, error } = useTx();
  if (!address || !owed || owed === 0n || !deployment?.disputeManager) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-emerald-900">
        <Wallet className="h-4 w-4" /> The DisputeManager owes you <strong>{eth(owed)}</strong> (returned bonds and committee rewards).
      </p>
      <button
        type="button"
        disabled={Boolean(pending)}
        onClick={() =>
          run("Withdrawing", async (wait) =>
            wait(await writeContractAsync({ address: deployment!.disputeManager, abi: disputeManagerAbi, functionName: "withdraw", chainId: activeChain.id })),
          )
        }
        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? `${pending}…` : "Withdraw"}
      </button>
      {error && <p className="w-full font-mono text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}

export default function DisputesPage() {
  const { data: events, isLoading } = useEvents({ limit: 200 });
  const dm = deployment?.disputeManager;
  const { data: bonds } = useReadContracts({
    allowFailure: false,
    query: { enabled: Boolean(dm) },
    contracts: dm
      ? [
          { address: dm, abi: disputeManagerAbi, functionName: "DISPUTE_BOND" },
          { address: dm, abi: disputeManagerAbi, functionName: "TIER1_BOND" },
          { address: dm, abi: disputeManagerAbi, functionName: "TIER2_BOND" },
        ]
      : [],
  });
  const [dBond, t1Bond, t2Bond] = (bonds ?? []) as bigint[];

  const prims = (events ?? []).filter((e) => e.kind === "primitive");
  const disputed = prims.filter((e) => e.status === EventStatus.Disputed);
  const proposed = prims.filter((e) => e.status === EventStatus.ProposedOutcome);
  const observing = prims.filter((e) => e.status === EventStatus.Open || e.status === EventStatus.ObservationsSubmitted);
  const decided = prims.filter((e) => e.availability !== Availability.Pending).slice(0, 12);

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_70%_at_70%_40%,white,transparent)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-14">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
            <Gavel className="h-4 w-4" /> Dispute Center
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">Challenge any outcome. Watch the committee decide.</h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-700">
            Every Novak fact can be disputed while its window is open. Resolvers on the committee re-check the source and vote
            with a bond; 66% of the committee decides — and if nobody can agree, the event is voided and markets refund.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Dispute bond", eth(dBond), "returned if the committee agrees with you"],
              ["Tier 1 vote", eth(t1Bond), "≤7 resolvers · 1 hour · 66%"],
              ["Tier 2 vote", eth(t2Bond), "≤15 resolvers · 2 hours · then VOID"],
            ].map(([k, v, h]) => (
              <div key={k} className="rounded-2xl border border-violet-100 bg-white/90 p-4 backdrop-blur">
                <p className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{k}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{v}</p>
                <p className="mt-0.5 text-xs text-gray-500">{h}</p>
              </div>
            ))}
          </div>
          <WithdrawStrip />
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 pb-20">
        {!deployment ? (
          <p className="mt-10 text-gray-600">No deployment configured for this chain.</p>
        ) : isLoading ? (
          <p className="mt-10 text-gray-500">Loading events from Robinhood Chain testnet…</p>
        ) : (
          <>
            <Group title="In committee" hint="Disputed — resolvers are voting now" items={disputed} openFirst={3} />
            <Group title="Open to challenge" hint="Proposed by quorum — disputable until the window closes" items={proposed} openFirst={2} />
            <Group title="Recently decided" hint="Finalized, voided or expired" items={decided} openFirst={disputed.length + proposed.length === 0 ? 1 : 0} />
            <Group title="Being observed" hint="Resolvers haven't reached quorum yet" items={observing} limit={5} />
            <p className="mt-12 text-sm text-gray-500">
              How the ladder works, with the exact maths: <Link href="/docs/disputes" className="text-violet-700 underline">Disputes &amp; committees</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
