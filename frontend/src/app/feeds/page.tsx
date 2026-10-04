"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import type { FeedRow } from "@/app/api/feeds/route";

interface Rates {
  fetchedAt: string;
  target: { date: string; upper: number; lower: number } | null;
  decisions: { date: string; upper: number; lower: number }[];
  effr: { date: string; rate: number } | null;
  errors: string[];
}

const ago = (unix: number) => {
  const s = Math.max(0, Date.now() / 1000 - unix);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/**
 * Live data board: every Chainlink price feed on Robinhood Chain (tokenized
 * stocks, the SGOV tokenized-Treasury ETF, crypto) plus US policy rates.
 * These are exactly the sources Novak resolvers read — markets on this site
 * settle on facts derived from them.
 */
export default function FeedsPage() {
  const [q, setQ] = useState("");
  const feeds = useQuery({
    queryKey: ["feeds"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/feeds");
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { fetchedAt: string; rows: FeedRow[] };
    },
  });
  const rates = useQuery({
    queryKey: ["rates"],
    refetchInterval: 1_800_000,
    queryFn: async () => (await (await fetch("/api/rates")).json()) as Rates,
  });

  const rows = useMemo(
    () =>
      (feeds.data?.rows ?? []).filter(
        (r) => !q || r.symbol.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [feeds.data, q],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">
        Live · Robinhood Chain mainnet (Chainlink) · FRED · NY Fed
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl text-ink">Data feeds</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">
        The raw inputs behind every Novak event: Chainlink&apos;s Robinhood stock and bond feeds, and the Fed funds rate.
        Novak resolvers read these, agree on the fact, and the dispute layer finalizes it — then any market can settle on
        it. <Link href="/markets" className="underline">Trade on them</Link>.
      </p>

      {/* Policy rates */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="border border-gray-300 bg-paper p-5 rounded-sm">
          <p className="font-mono text-[11px] uppercase text-gray-500">Fed funds target range</p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {rates.data?.target ? `${rates.data.target.lower.toFixed(2)}–${rates.data.target.upper.toFixed(2)}%` : "…"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-gray-500">FRED · as of {rates.data?.target?.date ?? "…"}</p>
        </div>
        <div className="border border-gray-300 bg-paper p-5 rounded-sm">
          <p className="font-mono text-[11px] uppercase text-gray-500">Effective fed funds rate</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{rates.data?.effr ? `${rates.data.effr.rate.toFixed(2)}%` : "…"}</p>
          <p className="mt-1 font-mono text-[11px] text-gray-500">NY Fed · {rates.data?.effr?.date ?? "…"}</p>
        </div>
        <div className="border border-gray-300 bg-paper p-5 rounded-sm">
          <p className="font-mono text-[11px] uppercase text-gray-500">Recent target changes</p>
          <ul className="mt-2 space-y-0.5 font-mono text-xs text-gray-700">
            {(rates.data?.decisions ?? []).slice(-4).map((d) => (
              <li key={d.date}>
                {d.date}: {d.lower.toFixed(2)}–{d.upper.toFixed(2)}%
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-gray-500">
            Fed-rate markets resolve via the <code>macro.fomc.v1</code> adapter on this same series.
          </p>
        </div>
      </section>

      {/* Price feeds */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <div className="font-mono text-xs text-gray-600">
          {feeds.data ? `${feeds.data.rows.length} feeds · fetched ${new Date(feeds.data.fetchedAt).toLocaleTimeString()}` : "Reading feeds…"}
        </div>
        <Input className="w-56" placeholder="Filter (NVDA, SGOV…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {feeds.error && <p className="mt-4 text-sm text-rose-700">{(feeds.error as Error).message}</p>}
      <div className="mt-4 overflow-x-auto border border-gray-300 rounded-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 font-mono uppercase tracking-wider text-gray-600 border-b border-gray-300">
            <tr>
              <th className="p-3">Asset</th>
              <th className="p-3">Class</th>
              <th className="p-3 text-right">Price (USD)</th>
              <th className="p-3">Updated</th>
              <th className="p-3">Hours</th>
              <th className="p-3">Feed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-mono bg-paper">
            {rows.map((r) => {
              const stale = r.updatedAt !== null && Date.now() / 1000 - r.updatedAt > Math.max(r.heartbeat, 3600) * 1.1;
              return (
                <tr key={r.feed}>
                  <td className="p-3">
                    <span className="font-bold text-ink">{r.symbol}</span>{" "}
                    <span className="font-sans text-gray-500">{r.name.replace(" (Robinhood Tokenized Equity)", "")}</span>
                  </td>
                  <td className="p-3 text-gray-600">{r.symbol === "SGOV" ? "Bond (T-bill ETF)" : r.assetClass}</td>
                  <td className="p-3 text-right text-ink font-semibold">
                    {r.price === null ? "n/a" : r.price.toLocaleString(undefined, { maximumFractionDigits: r.price < 10 ? 4 : 2 })}
                  </td>
                  <td className={`p-3 ${stale ? "text-amber-700" : "text-gray-600"}`}>
                    {r.updatedAt ? ago(r.updatedAt) : "—"}
                    {stale ? " · held" : ""}
                  </td>
                  <td className="p-3 text-gray-500">{r.marketHours?.replace("us_equities_", "") ?? "24/7"}</td>
                  <td className="p-3">
                    <a
                      className="underline text-gray-500"
                      href={`https://robinhoodchain.blockscout.com/address/${r.feed}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.feed.slice(0, 8)}…
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        &ldquo;held&rdquo; = the feed is holding its last price (stock feeds update 24/5 and pause when markets close). A
        Novak price-at event checks the round in effect at its time T and rejects rounds older than its staleness limit.
      </p>
    </div>
  );
}
