"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { CommunityStatus, explorerUrl, type Hex } from "@novakoracle/sdk";
import { ArrowLeft, CheckCircle2, Clock, Gavel, ShieldAlert, Trophy, Users } from "lucide-react";
import { NOVAK_CHAIN_ID, novakAddresses } from "@/lib/addresses";
import { fmtUsdg, useNovakClient } from "@/lib/novak";
import { useCommunityActivity, useCommunityMarket, useCommunityPosition } from "@/lib/community";
import { useTx } from "@/lib/useTx";
import { ConnectButton } from "@/components/ConnectButton";
import { cn, shortHex } from "@/lib/utils";

const when = (t: number | bigint) => new Date(Number(t) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const dur = (s: number) => {
  s = Math.max(0, Math.round(s));
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
};
function useNow() {
  const [n, setN] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setN(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return n;
}

const STATUS_LABEL: Record<CommunityStatus, string> = {
  [CommunityStatus.Open]: "Open",
  [CommunityStatus.Proposed]: "Result declared",
  [CommunityStatus.Resolved]: "Resolved",
  [CommunityStatus.Voided]: "Voided · refunds",
};

export function CommunityMarketView({ marketId }: { marketId: Hex }) {
  const { data: m, isLoading, error } = useCommunityMarket(marketId);
  const { address, isConnected } = useAccount();
  const { data: pos } = useCommunityPosition(marketId, address);
  const { data: activity } = useCommunityActivity(marketId);
  const client = useNovakClient();
  const { run, pending, error: txError } = useTx();
  const now = useNow();
  const [pick, setPick] = useState(0);
  const [amount, setAmount] = useState("10");
  const [declare, setDeclare] = useState<number | null>(null);
  const explorer = explorerUrl(NOVAK_CHAIN_ID);

  if (isLoading) return <div className="mx-auto mt-10 h-64 max-w-6xl animate-pulse rounded-3xl bg-gray-50" />;
  if (error || !m || !m.createdAt) return <p className="mx-auto max-w-6xl px-6 py-16 text-gray-600">Couldn&apos;t load this market.</p>;

  const isCreator = address?.toLowerCase() === m.creator.toLowerCase();
  const staking = m.status === CommunityStatus.Open && now < Number(m.closesAt);
  const awaiting = m.status === CommunityStatus.Open && now >= Number(m.closesAt);
  const overdue = awaiting && now > Number(m.resolveBy);
  const inObjection = m.status === CommunityStatus.Proposed && m.objectionEndsAt !== undefined && now < m.objectionEndsAt;
  const finalizable = m.status === CommunityStatus.Proposed && !inObjection;
  const final = m.status === CommunityStatus.Resolved || m.status === CommunityStatus.Voided;
  const myTotal = pos?.stakes.reduce((s, x) => s + x, 0n) ?? 0n;
  const amt = (() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  })();
  // What a stake would pay if this outcome wins, at the pool as it stands (pro rata, no fee).
  const payoutIf = (o: number, add: bigint) => {
    const pool = m.pools[o] + add;
    return pool > 0n ? (add * (m.totalPool + add)) / pool : 0n;
  };
  const objectedPct = m.totalPool > 0n ? Number((m.objectedStake * 10_000n) / m.totalPool) / 100 : 0;

  const stake = () =>
    client &&
    address &&
    run("Staking", async (wait) => {
      const allowance = await client.collateralAllowanceFor(address, novakAddresses.communityMarket!);
      if (allowance < amt) await wait(await client.approveCollateralFor(novakAddresses.communityMarket!, amt * 1000n, address));
      await wait(await client.communityStake(marketId, pick, amt, address));
    });
  const act = (label: string, fn: () => Promise<Hex>) => run(label, async (wait) => wait(await fn()));

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20">
      <Link href="/markets" className="link-plain mt-8 inline-flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-violet-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to markets
      </Link>

      {/* header */}
      <div className="mt-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_14px_40px_-30px_rgba(17,17,17,0.5)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gray-900 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">{m.category}</span>
          <span className="rounded-full border border-gray-200 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-gray-600">community · creator-resolved</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
              m.status === CommunityStatus.Resolved ? "bg-emerald-50 text-emerald-700" : m.status === CommunityStatus.Voided ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700",
            )}
          >
            {staking ? "staking open" : awaiting ? (overdue ? "creator overdue" : "awaiting result") : STATUS_LABEL[m.status]}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{m.question}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-gray-500">
          <span>
            Pool <strong className="text-gray-900">{fmtUsdg(m.totalPool)} USDG</strong>
          </span>
          <span>Staking closes {when(m.closesAt)}</span>
          <span>Result by {when(m.resolveBy)}</span>
          <span>
            Creator{" "}
            <a className="underline decoration-gray-300" href={explorer ? `${explorer}/address/${m.creator}` : undefined} target="_blank" rel="noreferrer">
              {shortHex(m.creator)}
            </a>
            {isCreator && " (you)"}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* outcomes */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outcomes · share of the pool</p>
            <div className="mt-4 flex flex-col gap-2.5">
              {m.outcomes.map((o, i) => {
                const won = m.status === CommunityStatus.Resolved && m.outcome === i;
                const declared = m.status === CommunityStatus.Proposed && m.outcome === i;
                const mult = m.pools[i] > 0n ? Number(m.totalPool) / Number(m.pools[i]) : undefined;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!staking}
                    onClick={() => setPick(i)}
                    className={cn(
                      "relative overflow-hidden rounded-xl border px-4 py-3 text-left transition",
                      staking && pick === i ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200",
                      won && "border-emerald-500 ring-1 ring-emerald-500",
                      declared && "border-violet-500 ring-1 ring-violet-500",
                      staking && "hover:border-gray-400",
                    )}
                  >
                    <span className={cn("absolute inset-y-0 left-0", won ? "bg-emerald-50" : "bg-violet-50")} style={{ width: `${Math.max(1, m.shares[i] * 100)}%` }} />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {won && <Trophy className="h-4 w-4 flex-none text-emerald-600" />}
                        {declared && <Gavel className="h-4 w-4 flex-none text-violet-600" />}
                        <span className="truncate font-semibold text-ink">{o}</span>
                      </span>
                      <span className="flex flex-none items-baseline gap-3 font-mono text-xs tabular-nums">
                        <span className="text-gray-500">{fmtUsdg(m.pools[i])} USDG</span>
                        <span className="text-gray-500">{mult ? `${mult.toFixed(2)}×` : "—"}</span>
                        <span className="w-12 text-right text-base font-bold text-ink">{Math.round(m.shares[i] * 100)}%</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              The multiple is what each USDG on that outcome returns if it wins, at the pool as it stands now. It moves as more
              people stake.
            </p>
          </div>

          {/* timeline */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <Clock className="h-3.5 w-3.5" /> Timeline
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { t: "Staking", d: staking ? `closes in ${dur(Number(m.closesAt) - now)}` : `closed ${when(m.closesAt)}`, s: staking ? "active" : "done" },
                {
                  t: "Creator declares",
                  d:
                    m.status === CommunityStatus.Open
                      ? awaiting
                        ? overdue
                          ? "missed the deadline"
                          : `due within ${dur(Number(m.resolveBy) - now)}`
                        : `by ${when(m.resolveBy)}`
                      : m.proposedAt
                        ? `declared ${when(m.proposedAt)}`
                        : "—",
                  s: awaiting ? (overdue ? "failed" : "active") : m.proposedAt ? "done" : final ? "done" : "todo",
                },
                {
                  t: "Objection window",
                  d: inObjection ? `ends in ${dur((m.objectionEndsAt ?? 0) - now)} · ${objectedPct}% objected` : m.proposedAt ? `${objectedPct}% objected` : `${Math.round(Number(m.objectionWindow) / 60)} min after declaring`,
                  s: inObjection ? "active" : m.proposedAt || final ? "done" : "todo",
                },
                {
                  t: m.status === CommunityStatus.Voided ? "Voided" : "Paid out",
                  d: m.status === CommunityStatus.Resolved ? `${m.outcomes[m.outcome]} won` : m.status === CommunityStatus.Voided ? "everyone refunded" : "winners split the pool",
                  s: final ? "done" : finalizable ? "active" : "todo",
                },
              ].map((x, i) => (
                <li
                  key={x.t}
                  className={cn(
                    "rounded-xl border p-3",
                    x.s === "active" && "border-gray-900 bg-gray-50",
                    x.s === "done" && "border-gray-200 bg-white",
                    x.s === "todo" && "border-gray-100 opacity-60",
                    x.s === "failed" && "border-rose-300 bg-rose-50",
                  )}
                >
                  <span className="flex items-center justify-between font-mono text-[10px] text-gray-400">
                    0{i + 1}
                    {x.s === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    {x.s === "active" && <span className="h-2 w-2 animate-ping rounded-full bg-gray-900" />}
                  </span>
                  <span className="mt-1 block text-[13px] font-semibold text-ink">{x.t}</span>
                  <span className="block font-mono text-[10.5px] leading-tight text-gray-500">{x.d}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* rules */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <Gavel className="h-3.5 w-3.5" /> How it resolves
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{m.rulesText || "The creator declares the result."}</p>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-gray-600">
              <li>• The creator declares the result after staking closes, by {when(m.resolveBy)}.</li>
              <li>
                • Then a {Math.round(Number(m.objectionWindow) / 60)}-minute objection window: if players holding over ⅓ of the pool object, the
                market is voided and everyone is refunded.
              </li>
              <li>• If the creator misses the deadline, anyone can void the market (refunds). If nobody backed the result, everyone is refunded.</li>
              <li className="text-gray-500">
                • This is a community market, resolved by its creator, not by Novak&apos;s resolver quorum and dispute committees.
              </li>
            </ul>
          </div>

          {/* activity */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <Users className="h-3.5 w-3.5" /> Stakes ({activity?.length ?? 0})
            </p>
            {!activity?.length ? (
              <p className="mt-2 text-sm text-gray-500">No stakes yet. Be the first.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {activity.slice(0, 25).map((a) => (
                  <li key={`${a.tx}-${a.outcome}`} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-[12px] text-gray-600">{shortHex(a.player)}</span>
                    <span className="truncate px-3 text-gray-800">{m.outcomes[a.outcome]}</span>
                    <a className="font-mono text-[12px] font-semibold text-ink hover:underline" href={explorer ? `${explorer}/tx/${a.tx}` : undefined} target="_blank" rel="noreferrer">
                      {fmtUsdg(a.amount)} USDG
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* action panel */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_14px_40px_-30px_rgba(17,17,17,0.5)]">
            {!isConnected ? (
              <>
                <p className="font-semibold text-ink">Join this market</p>
                <p className="mt-1 text-sm text-gray-600">Connect a wallet on Robinhood Chain testnet.</p>
                <div className="mt-3">
                  <ConnectButton />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                {staking && (
                  <div>
                    <p className="font-semibold text-ink">Stake on</p>
                    <p className="mt-0.5 truncate text-sm text-violet-700">{m.outcomes[pick]}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-gray-900"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      />
                      <span className="font-mono text-xs text-gray-500">USDG</span>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {["5", "10", "50", "100"].map((v) => (
                        <button key={v} type="button" onClick={() => setAmount(v)} className="rounded-lg border border-gray-200 px-2 py-1 font-mono text-[11px] text-gray-600 hover:border-gray-400">
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 flex justify-between text-sm">
                      <span className="text-gray-500">Pays if it wins</span>
                      <span className="font-semibold text-emerald-700">{amt > 0n ? `${fmtUsdg(payoutIf(pick, amt))} USDG` : "—"}</span>
                    </p>
                    <button
                      type="button"
                      disabled={Boolean(pending) || amt <= 0n}
                      onClick={stake}
                      className="mt-3 h-11 w-full rounded-full bg-gray-900 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
                    >
                      {pending ?? `Stake ${amount || 0} USDG`}
                    </button>
                  </div>
                )}

                {isCreator && awaiting && !overdue && (
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-ink">
                      <Gavel className="h-4 w-4" /> Declare the result
                    </p>
                    <p className="mt-1 text-xs text-gray-500">You&apos;re the resolver. Players then get the objection window.</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {m.outcomes.map((o, i) => (
                        <label key={i} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", declare === i ? "border-gray-900" : "border-gray-200")}>
                          <input type="radio" name="declare" checked={declare === i} onChange={() => setDeclare(i)} />
                          {o}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(pending) || declare === null}
                      onClick={() => client && address && declare !== null && act("Declaring result", () => client.communityPropose(marketId, declare, address))}
                      className="mt-3 h-10 w-full rounded-full bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
                    >
                      {pending ?? "Declare result"}
                    </button>
                  </div>
                )}

                {inObjection && myTotal > 0n && !pos?.objected && !isCreator && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
                      <ShieldAlert className="h-4 w-4" /> Wrong result?
                    </p>
                    <p className="mt-1 text-xs text-rose-800/80">
                      Declared: <strong>{m.outcomes[m.outcome]}</strong>. Object with your {fmtUsdg(myTotal)} USDG stake; over ⅓ of the pool objecting voids the
                      market and refunds everyone.
                    </p>
                    <button
                      type="button"
                      disabled={Boolean(pending)}
                      onClick={() => client && address && act("Objecting", () => client.communityObject(marketId, address))}
                      className="mt-2 h-9 w-full rounded-full bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                    >
                      Object to this result
                    </button>
                  </div>
                )}
                {pos?.objected && inObjection && <p className="text-xs text-rose-700">You objected. {objectedPct}% of the pool has objected so far.</p>}

                {finalizable && (
                  <button
                    type="button"
                    disabled={Boolean(pending)}
                    onClick={() => client && address && act("Finalizing", () => client.communityFinalize(marketId, address))}
                    className="h-10 w-full rounded-full bg-gray-900 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
                  >
                    Finalize: pay out {m.outcomes[m.outcome]}
                  </button>
                )}

                {overdue && (
                  <button
                    type="button"
                    disabled={Boolean(pending)}
                    onClick={() => client && address && act("Voiding", () => client.communityVoidUnresolved(marketId, address))}
                    className="h-10 w-full rounded-full border border-rose-300 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                  >
                    Creator missed the deadline: refund everyone
                  </button>
                )}

                {pos && pos.payout > 0n && (
                  <button
                    type="button"
                    disabled={Boolean(pending)}
                    onClick={() => client && address && act("Claiming", () => client.communityClaim(marketId, address))}
                    className="h-11 w-full rounded-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {m.status === CommunityStatus.Voided ? "Claim refund" : "Claim winnings"} · {fmtUsdg(pos.payout)} USDG
                  </button>
                )}
                {pos?.claimed && <p className="text-sm font-semibold text-emerald-700">Collected.</p>}

                {myTotal > 0n && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-wide text-gray-500">Your stakes</p>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {pos!.stakes.map((s, i) =>
                        s > 0n ? (
                          <li key={i} className="flex justify-between">
                            <span className="truncate text-gray-700">{m.outcomes[i]}</span>
                            <span className="font-mono text-gray-900">{fmtUsdg(s)}</span>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </div>
                )}

                {isCreator && !final && (
                  <button
                    type="button"
                    disabled={Boolean(pending)}
                    onClick={() => client && address && act("Cancelling", () => client.communityCancel(marketId, address))}
                    className="text-xs text-gray-500 underline decoration-gray-300 hover:text-rose-700"
                  >
                    Cancel market and refund everyone
                  </button>
                )}
                {txError && <p className="font-mono text-[11px] text-rose-700">{txError}</p>}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
