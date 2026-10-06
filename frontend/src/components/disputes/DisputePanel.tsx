"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { encodeAbiParameters, formatEther, keccak256, parseAbiParameters, type Address } from "viem";
import { useAccount, useSignMessage, useWriteContract } from "wagmi";
import { motion } from "framer-motion";
import { disputeManagerAbi, EventStatus, eventRegistryAbi, explorerUrl, type Hex } from "@novakoracle/sdk";
import { Check, Dices, Gavel, Hourglass, Scale, ShieldAlert, X } from "lucide-react";
import { deployment, NOVAK_CHAIN_ID, novakAddresses } from "@/lib/addresses";
import { seedMessage, useDisputeState, VoteChoice, type DisputeState, type TierView } from "@/lib/disputes";
import { useTx } from "@/lib/useTx";
import { activeChain } from "@/lib/wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { cn } from "@/lib/utils";

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const fmtLeft = (s: number) => {
  if (s <= 0) return "ended";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
};
const eth = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`;
const yn = (b: boolean | undefined) => (b === undefined ? "—" : b ? "TRUE" : "FALSE");

const STAGES = ["Observe", "Quorum", "Dispute window", "Committee", "Final"];
function stageOf(s: DisputeState): number {
  switch (s.status) {
    case EventStatus.Open:
      return 0;
    case EventStatus.ObservationsSubmitted:
      return 1;
    case EventStatus.ProposedOutcome:
      return 2;
    case EventStatus.Disputed:
      return 3;
    default:
      return 4;
  }
}

function Stepper({ stage, disputed }: { stage: number; disputed: boolean }) {
  return (
    <ol className="flex items-center gap-1">
      {STAGES.map((label, i) => {
        const done = i < stage;
        const now = i === stage;
        const skipped = i === 3 && !disputed && stage === 4;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done || now ? "bg-violet-400" : "bg-gray-200")} />
              <span
                className={cn(
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[10px] font-bold transition-colors",
                  now && "bg-violet-600 text-white shadow-[0_0_0_4px_rgba(124,58,237,0.15)]",
                  done && !skipped && "bg-violet-100 text-violet-700",
                  skipped && "bg-gray-100 text-gray-400",
                  !now && !done && "bg-gray-100 text-gray-400",
                )}
              >
                {(done && !skipped) || (now && i === STAGES.length - 1) ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === STAGES.length - 1 ? "bg-transparent" : done ? "bg-violet-400" : "bg-gray-200")} />
            </div>
            <span className={cn("truncate text-center text-[10px] sm:text-[11px]", now ? "font-semibold text-violet-700" : "text-gray-500")}>
              {skipped ? "not needed" : label === "Dispute window" ? (
                <>
                  <span className="hidden sm:inline">Dispute </span>
                  <span className="sm:hidden">Window</span>
                  <span className="hidden sm:inline">window</span>
                </>
              ) : (
                label
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function VoteBar({ label, votes, needed, size, tone }: { label: string; votes: number; needed: number; size: number; tone: "true" | "false" }) {
  const pct = size ? Math.min(100, (votes / size) * 100) : 0;
  const threshold = size ? (needed / size) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-mono text-gray-500">
          {votes} / {needed} needed
        </span>
      </div>
      <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className={cn("h-full rounded-full", tone === "true" ? "bg-emerald-500" : "bg-rose-500")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <span className="absolute top-0 h-full w-0.5 bg-ink/60" style={{ left: `${threshold}%` }} title="66% of the committee" />
      </div>
    </div>
  );
}

function Committee({ t, now, me, decided }: { t: TierView; now: number; me?: Address; decided: boolean }) {
  const size = t.committee.length;
  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Scale className="h-4 w-4 text-violet-600" /> Tier {t.tier} committee · {size} member{size === 1 ? "" : "s"}
        </p>
        <span className="flex items-center gap-1 font-mono text-[11px] text-gray-600">
          <Hourglass className="h-3 w-3" /> {decided ? "decided" : now < t.deadline ? `closes in ${fmtLeft(t.deadline - now)}` : "window ended"} · bond {eth(t.bond)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {t.committee.map((m) => (
          <span
            key={m.address}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              m.vote === VoteChoice.VotedTrue && "border-emerald-200 bg-emerald-50 text-emerald-800",
              m.vote === VoteChoice.VotedFalse && "border-rose-200 bg-rose-50 text-rose-800",
              m.vote === VoteChoice.NotVoted && "border-gray-200 bg-white text-gray-500",
              me && m.address.toLowerCase() === me.toLowerCase() && "ring-2 ring-violet-400",
            )}
            title={m.address}
          >
            <span className="font-mono font-semibold">{m.label}</span>
            {m.vote === VoteChoice.VotedTrue ? "voted TRUE" : m.vote === VoteChoice.VotedFalse ? "voted FALSE" : "waiting"}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <VoteBar label="TRUE" votes={t.trueVotes} needed={t.needed} size={size} tone="true" />
        <VoteBar label="FALSE" votes={t.falseVotes} needed={t.needed} size={size} tone="false" />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Decides the moment one side reaches {t.needed} of {size} (66% of the committee, not of votes cast).
      </p>
    </div>
  );
}

export function DisputePanel({ eventId, title, compact = false }: { eventId: Hex; title?: string; compact?: boolean }) {
  const { data: s, isLoading, error } = useDisputeState(eventId);
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { run, pending, error: txError, lastHash } = useTx();
  const now = useNow();
  const explorer = explorerUrl(NOVAK_CHAIN_ID);

  if (!deployment?.disputeManager) return null;
  if (isLoading || !s) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-5">
        <p className="text-sm text-gray-500">{error ? `Couldn't load the dispute state: ${(error as Error).message.split("\n")[0]}` : "Loading the dispute layer…"}</p>
      </div>
    );
  }

  const dm = deployment.disputeManager;
  const reg = novakAddresses.eventRegistry;
  // One helper for every DisputeManager/Registry write; wagmi switches the wallet
  // to Robinhood Chain testnet first if needed (chainId).
  type WriteReq = { address: Address; abi: typeof disputeManagerAbi | typeof eventRegistryAbi; functionName: string; args: readonly unknown[]; value?: bigint };
  const write = (label: string, req: WriteReq) =>
    run(label, async (wait) =>
      wait(await writeContractAsync({ ...req, chainId: activeChain.id } as unknown as Parameters<typeof writeContractAsync>[0])),
    );

  const stage = stageOf(s);
  const disputed = s.caseExists;
  const active = s.tiers.find((t) => t.tier === s.activeTier);
  const meOnCommittee = active?.committee.find((m) => address && m.address.toLowerCase() === address.toLowerCase());
  const windowOpen = s.status === EventStatus.ProposedOutcome && s.windowEndsAt !== undefined && now < s.windowEndsAt;
  const submittedCount = s.resolvers.filter((r) => r.submitted).length;
  const deciding = s.tiers[s.tiers.length - 1];

  let verdict: React.ReactNode = null;
  if (s.status === EventStatus.Finalized) {
    verdict = (
      <p className="text-sm text-gray-700">
        <span className={cn("mr-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold", s.finalOutcome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
          {yn(s.finalOutcome)}
        </span>
        {disputed && deciding
          ? `decided by the Tier ${deciding.tier} committee (${deciding.trueVotes}–${deciding.falseVotes})${s.hasOriginalProposal ? (s.finalOutcome === s.proposedOutcome ? " — the proposal was upheld" : " — the proposal was overturned") : ""}.`
          : `finalized by resolver quorum; nobody disputed it in the ${Math.round(s.disputeWindowSeconds / 60)}-minute window.`}
      </p>
    );
  } else if (s.status === EventStatus.Voided) {
    verdict = <p className="text-sm text-gray-700">Voided — the committees couldn&apos;t reach 66%. Markets refund; bonds were returned.</p>;
  } else if (s.status === EventStatus.Expired) {
    verdict = <p className="text-sm text-gray-700">Expired — nobody observed it before the deadline. Markets refund.</p>;
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_10px_30px_-22px_rgba(109,74,255,0.5)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
            <Gavel className="h-3.5 w-3.5" /> Dispute layer
          </p>
          {title && <p className="mt-0.5 truncate font-semibold text-ink">{title}</p>}
        </div>
        <Link href={`/events/${eventId}`} className="link-plain font-mono text-[11px] text-gray-400 hover:text-violet-700">
          {eventId.slice(0, 10)}… · full history →
        </Link>
      </div>

      <div className="mt-4">
        <Stepper stage={stage} disputed={disputed} />
      </div>

      {/* Resolver observations */}
      {!compact && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Resolvers:</span>
          {s.resolvers.map((r) => (
            <span
              key={r.address}
              title={r.address}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                !r.submitted && "border-gray-200 text-gray-400",
                r.submitted && r.outcome && "border-emerald-200 bg-emerald-50 text-emerald-800",
                r.submitted && !r.outcome && "border-rose-200 bg-rose-50 text-rose-800",
              )}
            >
              {r.label} {r.submitted ? yn(r.outcome) : "—"}
            </span>
          ))}
          <span className="font-mono text-[11px] text-gray-500">
            {submittedCount} observed · quorum {s.quorumThreshold} of {s.resolvers.length}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {s.status === EventStatus.Open && (
          <p className="text-sm text-gray-600">
            Waiting for resolvers to observe the source. Observations close {now < s.observationDeadline ? `in ${fmtLeft(s.observationDeadline - now)}` : "— deadline passed"}.
          </p>
        )}
        {s.status === EventStatus.ObservationsSubmitted && (
          <p className="text-sm text-gray-600">
            {submittedCount} observation{submittedCount === 1 ? "" : "s"} in; {s.quorumThreshold} identical answers are needed to propose an outcome.
          </p>
        )}

        {s.status === EventStatus.ProposedOutcome && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-sm text-gray-700">
              Proposed{" "}
              <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-xs font-bold", s.proposedOutcome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                {yn(s.proposedOutcome)}
              </span>{" "}
              by resolver quorum ·{" "}
              {windowOpen ? (
                <span className="font-semibold text-violet-700">dispute window closes in {fmtLeft(s.windowEndsAt! - now)}</span>
              ) : (
                <span>dispute window ended — ready to finalize</span>
              )}
            </p>
            {windowOpen && (
              <p className="mt-2 text-xs text-gray-500">
                Think it&apos;s wrong? Dispute it with a {eth(s.disputeBond)} bond. A committee of resolvers re-checks the source: if
                they overturn it you get the bond back; if they uphold it, ⅓ is burned and ⅔ goes to the treasury.
              </p>
            )}
          </div>
        )}

        {s.seed?.seeding && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Dices className="h-4 w-4 text-indigo-600" /> Drawing the Tier {s.activeTier} committee · commit-reveal
              </p>
              <span className="font-mono text-[11px] text-gray-600">
                {now < s.seed.commitDeadline
                  ? `commit phase · ${fmtLeft(s.seed.commitDeadline - now)}`
                  : now < s.seed.revealDeadline
                    ? `reveal phase · ${fmtLeft(s.seed.revealDeadline - now)}`
                    : "ready to draw"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xl font-bold text-ink">{s.seed.commits}</p>
                <p className="font-mono text-[10px] uppercase text-gray-500">salts committed</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-xl font-bold text-ink">{s.seed.reveals}</p>
                <p className="font-mono text-[10px] uppercase text-gray-500">salts revealed</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-600">
              {s.resolvers.length} resolvers, more than the committee holds — so members are drawn from the XOR of the resolvers&apos;
              revealed salts. Nobody, not even the sequencer, can predict or steer it; a committer that doesn&apos;t reveal is excluded.
            </p>
          </div>
        )}

        {s.tiers.map((t) => (
          <Committee key={t.tier} t={t} now={now} me={address} decided={s.caseResolved || t.tier < s.activeTier} />
        ))}

        {verdict}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {windowOpen &&
          (isConnected ? (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={() => write("Filing dispute", { address: dm, abi: disputeManagerAbi, functionName: "dispute", args: [eventId], value: s.disputeBond })}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <ShieldAlert className="h-4 w-4" /> Dispute this outcome · {eth(s.disputeBond)}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              Connect a wallet to dispute <ConnectButton />
            </div>
          ))}

        {s.status === EventStatus.ProposedOutcome && !windowOpen && (
          <button
            type="button"
            disabled={Boolean(pending) || !isConnected}
            onClick={() => write("Finalizing", { address: reg, abi: eventRegistryAbi, functionName: "finalize", args: [eventId] })}
            className="rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:border-violet-400 disabled:opacity-50"
          >
            Finalize (anyone can)
          </button>
        )}

        {s.status === EventStatus.ObservationsSubmitted && now > s.observationDeadline && (
          <button
            type="button"
            disabled={Boolean(pending) || !isConnected}
            onClick={() => write("Escalating split quorum", { address: dm, abi: disputeManagerAbi, functionName: "escalateNonConvergence", args: [eventId] })}
            className="rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:border-violet-400 disabled:opacity-50"
          >
            Send split quorum to a committee
          </button>
        )}

        {s.seed?.seeding && (() => {
          const seed = s.seed!;
          const amResolver = address && s.resolvers.some((r) => r.address.toLowerCase() === address.toLowerCase());
          const saltFor = async () => keccak256(await signMessageAsync({ message: seedMessage(eventId, s.activeTier) }));
          const canDraw = now >= seed.revealDeadline || (seed.commits > 0 && seed.reveals === seed.commits && now >= seed.commitDeadline);
          return (
            <>
              {amResolver && now < seed.commitDeadline && (
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    run("Committing salt", async (wait) => {
                      const salt = await saltFor();
                      const commitment = keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint8, address, bytes32"), [eventId, s.activeTier, address!, salt]));
                      await wait(await writeContractAsync({ address: dm, abi: disputeManagerAbi, functionName: "commitSeed", args: [eventId, commitment], chainId: activeChain.id }));
                    })
                  }
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Commit my salt
                </button>
              )}
              {amResolver && now >= seed.commitDeadline && now < seed.revealDeadline && (
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    run("Revealing salt", async (wait) =>
                      wait(await writeContractAsync({ address: dm, abi: disputeManagerAbi, functionName: "revealSeed", args: [eventId, await saltFor()], chainId: activeChain.id })),
                    )
                  }
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Reveal my salt
                </button>
              )}
              {canDraw && (
                <button
                  type="button"
                  disabled={Boolean(pending) || !isConnected}
                  onClick={() => write("Drawing committee", { address: dm, abi: disputeManagerAbi, functionName: "drawCommittee", args: [eventId] })}
                  className="rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-400 disabled:opacity-50"
                >
                  Draw the committee (anyone can)
                </button>
              )}
            </>
          );
        })()}

        {s.status === EventStatus.Disputed && active && meOnCommittee && meOnCommittee.vote === VoteChoice.NotVoted && now < active.deadline && (
          <>
            <span className="text-xs font-semibold text-violet-700">You&apos;re on this committee ({meOnCommittee.label}):</span>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={Boolean(pending)}
                onClick={() =>
                  write(`Voting ${v ? "TRUE" : "FALSE"}`, {
                    address: dm,
                    abi: disputeManagerAbi,
                    functionName: active.tier === 1 ? "submitTier1Vote" : "submitTier2Vote",
                    args: [eventId, v],
                    value: active.bond,
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50",
                  v ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
                )}
              >
                {v ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} Vote {v ? "TRUE" : "FALSE"} · {eth(active.bond)}
              </button>
            ))}
          </>
        )}

        {s.status === EventStatus.Disputed && active && !s.seed?.seeding && now >= active.deadline && (
          <button
            type="button"
            disabled={Boolean(pending) || !isConnected}
            onClick={() =>
              write(active.tier === 1 ? "Escalating to Tier 2" : "Voiding", {
                address: dm,
                abi: disputeManagerAbi,
                functionName: active.tier === 1 ? "escalateTier2" : "voidAfterTier2Timeout",
                args: [eventId],
              })
            }
            className="rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:border-violet-400 disabled:opacity-50"
          >
            {active.tier === 1 ? "No 66% in Tier 1 → escalate to Tier 2" : "No 66% in Tier 2 → void (refunds)"}
          </button>
        )}
      </div>

      {(pending || txError || lastHash) && (
        <p className={cn("mt-3 font-mono text-[11px]", txError ? "text-rose-700" : "text-gray-500")}>
          {pending ? `${pending}…` : txError ? txError : lastHash && explorer ? (
            <a className="underline" href={`${explorer}/tx/${lastHash}`} target="_blank" rel="noreferrer">
              last transaction ↗
            </a>
          ) : null}
        </p>
      )}
    </div>
  );
}
