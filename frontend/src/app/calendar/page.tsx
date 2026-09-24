"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import type { CalendarRow } from "@/app/api/rh-assets/route";

const ONE = 10n ** 18n;

/** Signed change between two 1e18 multipliers, in percent. */
function changePct(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = BigInt(from);
  const b = BigInt(to);
  if (a === 0n) return null;
  return Number(((b - a) * 1_000_000n) / a) / 10_000;
}

const fmtDate = (unix: number) =>
  new Date(unix * 1000).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The corporate-action calendar Chainlink explicitly doesn't provide: every
 * Robinhood Stock Token's ERC-8056 multiplier state, read live from Robinhood
 * Chain mainnet. A scheduled change (newUIMultiplier != uiMultiplier with a
 * future effectiveAt) is exactly what a lending market needs to know about
 * BEFORE the price discontinuity — and what a Novak `rh.corporate-action`
 * event finalizes for every protocol at once.
 */
export default function CalendarPage() {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["rh-assets"],
    queryFn: async () => {
      const r = await fetch("/api/rh-assets");
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { fetchedAt: string; rows: CalendarRow[] };
    },
    refetchInterval: 300_000,
  });

  const now = Date.now() / 1000;
  const rows = useMemo(() => {
    const all = (data?.rows ?? []).filter(
      (r) => !q || r.symbol.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()),
    );
    const scheduled = (r: CalendarRow) =>
      r.newUIMultiplier !== null && r.uiMultiplier !== null && r.newUIMultiplier !== r.uiMultiplier && (r.effectiveAt ?? 0) > now;
    return all.sort((a, b) => {
      if (scheduled(a) !== scheduled(b)) return scheduled(a) ? -1 : 1;
      return (b.effectiveAt ?? 0) - (a.effectiveAt ?? 0);
    });
  }, [data, q, now]);

  const scheduledCount = rows.filter(
    (r) => r.newUIMultiplier !== r.uiMultiplier && (r.effectiveAt ?? 0) > now,
  ).length;
  const pausedCount = rows.filter((r) => r.oraclePaused).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="border-b border-gray-200 pb-6">
        <p className="font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Live · Robinhood Chain mainnet · ERC-8056
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl text-ink">Corporate-action calendar</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 leading-relaxed">
          Chainlink&apos;s docs are explicit: it &ldquo;does not provide corporate-action calendar data or automated pause
          triggers.&rdquo; This page reads every Robinhood Stock Token&apos;s multiplier state directly from Robinhood
          Chain. A <strong>scheduled</strong> change is a price discontinuity a lending market must see coming — Novak&apos;s{" "}
          <code>rh.corporate-action</code> events finalize it once for every protocol, and the{" "}
          <Link href="/guard">lending guard</Link> acts on it.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-6 font-mono text-xs text-gray-600">
          <span>
            Tokens: <strong className="text-ink">{data?.rows.length ?? "…"}</strong>
          </span>
          <span>
            Scheduled changes: <strong className="text-ink">{data ? scheduledCount : "…"}</strong>
          </span>
          <span>
            Oracle paused: <strong className="text-ink">{data ? pausedCount : "…"}</strong>
          </span>
          {data && <span>Fetched {new Date(data.fetchedAt).toLocaleTimeString()}</span>}
        </div>
        <Input className="w-56" placeholder="Filter (NVDA, Apple…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading && <p className="mt-6 text-sm text-gray-500">Reading 190+ stock tokens from Robinhood Chain…</p>}
      {error && <p className="mt-6 text-sm text-rose-700">Couldn&apos;t load: {(error as Error).message}</p>}

      {data && (
        <div className="mt-6 overflow-x-auto border border-gray-300 rounded-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 font-mono uppercase tracking-wider text-gray-600 border-b border-gray-300">
              <tr>
                <th className="p-3">Token</th>
                <th className="p-3">Multiplier</th>
                <th className="p-3">Next / last change</th>
                <th className="p-3">Effective</th>
                <th className="p-3">Oracle</th>
                <th className="p-3">Regular session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-mono bg-paper">
              {rows.map((r) => {
                const scheduled = r.newUIMultiplier !== r.uiMultiplier && (r.effectiveAt ?? 0) > now;
                const pct = scheduled ? changePct(r.uiMultiplier, r.newUIMultiplier) : changePct(ONE.toString(), r.uiMultiplier);
                return (
                  <tr key={r.address} className={scheduled ? "bg-amber-50" : undefined}>
                    <td className="p-3">
                      <span className="font-bold text-ink">{r.symbol}</span>{" "}
                      <span className="font-sans text-gray-500">{r.name.replace(" • Robinhood Token", "")}</span>
                    </td>
                    <td className="p-3 text-ink">{r.uiMultiplier ? (Number(BigInt(r.uiMultiplier) / 10n ** 12n) / 1e6).toFixed(6) : "n/a"}</td>
                    <td className="p-3">
                      {scheduled ? (
                        <span className="font-semibold text-amber-800">
                          SCHEDULED {pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(4)}%` : ""}
                        </span>
                      ) : pct !== null ? (
                        <span className="text-gray-600">cumulative {pct > 0 ? "+" : ""}{pct.toFixed(4)}% since 1.0</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-gray-700">{r.effectiveAt ? fmtDate(r.effectiveAt) : "—"}</td>
                    <td className="p-3">{r.oraclePaused === null ? "n/a" : r.oraclePaused ? <strong className="text-rose-700">PAUSED</strong> : "live"}</td>
                    <td className="p-3">{r.tradable.market === undefined ? "—" : r.tradable.market ? "tradable" : <strong>not tradable</strong>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Sources: api.robinhood.com/rhj/assets and each token&apos;s on-chain <code>uiMultiplier</code>, <code>newUIMultiplier</code>,{" "}
        <code>effectiveAt</code>, <code>oraclePaused</code>. Stock tokens are not available to U.S. or UK persons; this page is
        read-only data.
      </p>
    </div>
  );
}
