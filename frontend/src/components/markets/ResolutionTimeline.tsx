"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { EventNode } from "@/lib/novak";
import { useResolution } from "@/lib/resolution";
import { cn } from "@/lib/utils";

/**
 * The market's real path to settlement, from chain state: trading → the
 * price read at T → resolver quorum → dispute window → settled / refunded,
 * each with its actual time, live progress and countdown. With resolvers
 * running, a market settles about (dispute window + a couple of minutes)
 * after T.
 */

type State = "done" | "active" | "todo" | "failed";

const when = (t?: number) =>
  t ? new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const dur = (s: number) => {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
};

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ResolutionTimeline({
  events,
  tradingClosesAt,
  settled,
  refunding,
  outcomeLabel,
}: {
  events: EventNode[];
  tradingClosesAt: bigint | number;
  settled: boolean;
  refunding: boolean;
  /** e.g. "YES" or "$230–$232.50" once settled. */
  outcomeLabel?: string;
}) {
  const { data: r } = useResolution(events);
  const now = useNow();
  const close = Number(tradingClosesAt);
  const final = settled || refunding;

  const T = r?.readAt ?? close;
  const window = r?.windowS ?? 1800;
  const expired = Boolean(r?.expired);
  const missed = expired || Boolean(r && !r.allProposed && !r.allFinal && now > r.deadline);
  const eta = r?.windowEndsAt ?? T + 120 + window; // proposal ~1–2 min after T, then the window

  const steps: { n: string; title: string; state: State; lines: [ReactNode, ReactNode?][] }[] = [
    {
      n: "01",
      title: "Trading open",
      state: now < close && !final ? "active" : "done",
      lines: now < close ? [[`closes in ${dur(close - now)}`], [when(close)]] : [["closed"], [when(close)]],
    },
    {
      n: "02",
      title: "Price read at T",
      state: now >= T || final ? "done" : "todo",
      lines: [[now >= T ? "Chainlink round at" : `in ${dur(T - now)}`], [when(T)]],
    },
    {
      n: "03",
      title: "Resolver quorum",
      state: missed ? "failed" : final || r?.allProposed || r?.allFinal ? "done" : now >= T ? "active" : "todo",
      lines: missed
        ? [[`${r?.reported ?? 0}/${r?.quorum ?? 2} reported by deadline`], [when(r?.deadline)]]
        : final || r?.allProposed || r?.allFinal
          ? [[r?.proposedAt ? "proposed" : "reached"], [when(r?.proposedAt)]]
          : missed
            ? [["no quorum by deadline"], ["→ voided, full refunds"]]
            : now >= T
              ? [[`${r?.reported ?? 0}/${r?.quorum ?? 2} resolvers reported`], [`deadline ${when(r?.deadline)}`]]
              : [["usually ~1 min after T"], [`deadline ${when(r?.deadline)}`]],
    },
    {
      n: "04",
      title: r?.disputed ? "Disputed" : "Dispute window",
      state: missed ? "todo" : final || r?.allFinal ? "done" : r?.allProposed ? "active" : "todo",
      lines: missed
        ? [["skipped: nothing to dispute"]]
        : r?.disputed
        ? [["bonded committee voting"], [<Link key="d" href="/disputes" className="underline">open the Dispute Center</Link>]]
        : r?.allProposed && r.windowEndsAt && !r.allFinal
          ? [[now < r.windowEndsAt ? `ends in ${dur(r.windowEndsAt - now)}` : "ended, finalizing"], [when(r.windowEndsAt)]]
          : r?.allFinal
            ? [[r.voided ? "voided" : "finalized"], [when(r.finalizedAt)]]
            : [[`${Math.round(window / 60)} min for anyone to challenge`]],
    },
    {
      n: "05",
      title: refunding ? "Refunding" : settled ? "Settled" : "Settled",
      state: final ? "done" : r?.allFinal || missed ? "active" : "todo",
      lines: settled
        ? [[outcomeLabel ? `won: ${outcomeLabel}` : "payouts claimable"], ["collect in Portfolio"]]
        : refunding
          ? [["every stake refunded"], ["collect in Portfolio"]]
          : r?.allFinal || missed
            ? [["keeper settles within ~15s"]]
            : [[`expected ≈ ${when(eta)}`]],
    },
  ];

  return (
    <div className="border border-gray-300 bg-paper p-6 rounded-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold text-ink">
          <Clock className="h-4 w-4 text-emerald-600" />
          Market Lifecycle &amp; Resolution Timeline
        </div>
        <span className="font-mono text-[11px] text-gray-500">
          {final
            ? refunding
              ? expired
                ? "Expired (no quorum by deadline) · refunds open"
                : "Voided · refunds open"
              : `Settled${outcomeLabel ? ` · ${outcomeLabel}` : ""}`
            : missed
              ? "No quorum by the observation deadline · refunding"
              : now < eta
                ? `Expected settlement ≈ ${when(eta)} (in ${dur(eta - now)})`
                : "Settling now"}
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
        {steps.map((s) => (
          <div
            key={s.n}
            className={cn(
              "flex flex-col justify-between rounded-sm border p-3 transition-all",
              s.state === "active" && "border-emerald-600 bg-emerald-50/70 shadow-sm",
              s.state === "done" && "border-gray-300 bg-gray-50 text-gray-700",
              s.state === "todo" && "border-gray-200 bg-paper opacity-60",
              s.state === "failed" && "border-rose-300 bg-rose-50/70",
            )}
          >
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                    s.state === "active" ? "bg-emerald-600 text-paper" : s.state === "done" ? "bg-gray-800 text-paper" : s.state === "failed" ? "bg-rose-600 text-white" : "bg-gray-200 text-gray-600",
                  )}
                >
                  {s.n}
                </span>
                {s.state === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : s.state === "active" ? (
                  <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500" />
                ) : s.state === "failed" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                ) : null}
              </div>
              <h4 className="font-mono text-xs font-semibold text-ink">{s.title}</h4>
              {s.lines.map(([a, b], i) => (
                <p key={i} className={cn("mt-1 font-mono text-[10.5px] leading-tight tabular-nums", i === 0 ? "text-gray-700" : "text-gray-500")}>
                  {a}
                  {b ? <span className="block">{b}</span> : null}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
        Resolvers read the Chainlink round in force at T on Robinhood Chain mainnet and report it on-chain. Once a quorum agrees,
        anyone has {Math.round(window / 60)} minutes to dispute; then the keeper finalizes and settles the market, and payouts or refunds
        appear in your Portfolio. If no quorum forms before the observation deadline, the event is voided and every stake is refunded.
      </p>
    </div>
  );
}
