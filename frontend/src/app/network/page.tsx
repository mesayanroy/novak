"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { disputeManagerAbi, explorerUrl } from "@novakoracle/sdk";
import { Activity, Cpu, Gavel, KeyRound, Landmark, Server, Wallet } from "lucide-react";
import { deployment, NOVAK_CHAIN_ID } from "@/lib/addresses";
import { RESOLVER_URL, useResolverHealth, type NodeHealth } from "@/lib/explorer";
import { useNetworkStats, type ResolverStats } from "@/lib/network";
import { votesNeeded } from "@/lib/disputes";
import { fmtUsdg } from "@/lib/novak";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { cn } from "@/lib/utils";

const eth = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 5 })} ETH`;
const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const online = (h?: NodeHealth) => Boolean(h?.lastLoopAt && Date.now() - new Date(h.lastLoopAt).getTime() < 3 * 60_000);

/* Validated categorical palette (dataviz validator: all checks pass on the light surface). */
const FLOW = [
  { key: "resolvers", label: "Correct resolvers", color: "#7c3aed" },
  { key: "committee", label: "Committee voters", color: "#0891b2" },
  { key: "insurance", label: "Insurance reserve", color: "#d97706" },
  { key: "treasury", label: "Treasury", color: "#db2777" },
] as const;

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-gray-50/80 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-bold text-ink">{value}</p>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function NodeCard({ r, h, tier1Bond, serviceUp }: { r: ResolverStats; h?: NodeHealth; tier1Bond?: bigint; serviceUp: boolean }) {
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  const live = online(h);
  const votesAffordable = tier1Bond && tier1Bond > 0n ? Number(r.ethBalance / tier1Bond) : undefined;
  return (
    <div className="flex flex-col rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_14px_40px_-28px_rgba(109,74,255,0.6)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 font-mono text-sm font-bold text-white shadow-md shadow-violet-500/30">
            {r.label}
          </span>
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              Resolver {r.label.slice(1)}
              {h?.keeper && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-violet-700">keeper</span>}
            </p>
            <a
              href={explorer ? `${explorer}/address/${r.address}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-gray-500 hover:text-violet-700"
            >
              {r.address.slice(0, 8)}…{r.address.slice(-6)} ↗
            </a>
          </div>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px]",
            live ? "bg-emerald-50 text-emerald-700" : serviceUp ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-emerald-500" : serviceUp ? "bg-amber-500" : "bg-gray-400")} />
          {live ? "online" : serviceUp ? "stale" : "status n/a"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Observations" value={r.observations} hint="on-chain" />
        <Stat label="Committee votes" value={r.votes} hint="on-chain" />
        <Stat label="Keeper actions" value={h?.keeperActions ?? "—"} hint={h ? "this session" : undefined} />
        <Stat label="Rewards claimed" value={fmtUsdg(r.resolverRewards + r.committeeRewards)} hint="USDG from the vault" />
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-gray-600">
            <Wallet className="h-3.5 w-3.5" /> Balance
          </span>
          <span className="font-mono text-ink">{eth(r.ethBalance)}</span>
        </div>
        {votesAffordable !== undefined && (
          <p className={cn("text-right text-[11px]", votesAffordable < 2 ? "text-rose-600" : "text-gray-500")}>
            {votesAffordable < 2 ? "low — top up from the faucet to keep voting" : `covers ~${votesAffordable} Tier-1 votes`}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Owed by DisputeManager</span>
          <span className="font-mono text-ink">{eth(r.ethOwed)}</span>
        </div>
        {h && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Last loop</span>
              <span className="font-mono text-ink">{ago(h.lastLoopAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Scanned to block</span>
              <span className="font-mono text-ink">{String(h.scannedToBlock ?? "—")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Events tracked · evidence kept</span>
              <span className="font-mono text-ink">
                {h.events ?? 0} · {h.evidenceRecords ?? 0}
              </span>
            </div>
          </>
        )}
        {h?.lowBalance && (
          <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Low-balance alert from the node: below {eth(BigInt(h.minBalanceWei ?? "0"))} (2 committee bonds + gas).
          </p>
        )}
        {h?.lastError && <p className="rounded-lg bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-700">{h.lastError}</p>}
      </div>
    </div>
  );
}

function FeeFlow({ flow }: { flow: Record<(typeof FLOW)[number]["key"], bigint> }) {
  const total = FLOW.reduce((s, f) => s + flow[f.key], 0n);
  return (
    <div>
      {total === 0n ? (
        <div className="flex h-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500">no fees allocated yet</div>
      ) : (
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="Where market fees went">
          {FLOW.filter((f) => flow[f.key] > 0n).map((f) => (
            <div
              key={f.key}
              className="h-full transition-opacity hover:opacity-80"
              style={{ width: `${(Number(flow[f.key]) / Number(total)) * 100}%`, background: f.color }}
              title={`${f.label}: ${fmtUsdg(flow[f.key])} USDG (${((Number(flow[f.key]) / Number(total)) * 100).toFixed(1)}%)`}
            />
          ))}
        </div>
      )}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {FLOW.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-gray-700">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: f.color }} />
              {f.label}
            </span>
            <span className="font-mono text-ink">
              {fmtUsdg(flow[f.key])} <span className="text-gray-400">USDG</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NetworkPage() {
  const { data: stats, isLoading, error: statsError, refetch } = useNetworkStats();
  const { data: health, error: healthError } = useResolverHealth();
  const { data: tier1Bond } = useReadContract({
    address: deployment?.disputeManager,
    abi: disputeManagerAbi,
    functionName: "TIER1_BOND",
    query: { enabled: Boolean(deployment?.disputeManager) },
  });
  const serviceUp = Boolean(health && !healthError);
  const n = stats?.resolvers.length ?? 0;
  const quorum = 2;
  const healthFor = (a: string) => health?.find((h) => h.address?.toLowerCase() === a.toLowerCase());

  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_80%_at_80%_30%,white,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
            <Cpu className="h-4 w-4" /> Resolver network
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">The nodes that turn sources into facts.</h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-700">
            Each resolver reads Robinhood Chain mainnet, submits what it saw with evidence, votes in dispute committees and is paid
            from market fees only when it was right.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs">
            {[
              `${n || "…"} authorized resolvers`,
              `default quorum ${quorum} of ${n || "…"}`,
              n ? `committee decides at ${votesNeeded(Math.min(n, 7))} of ${Math.min(n, 7)}` : "committee …",
              stats ? `${stats.disputesFiled} dispute${stats.disputesFiled === 1 ? "" : "s"} filed · ${stats.eventsDecidedByCommittee} decided by committee` : "",
            ]
              .filter(Boolean)
              .map((t) => (
                <span key={t} className="rounded-full border border-violet-200 bg-white/90 px-3 py-1.5 text-violet-800">
                  {t}
                </span>
              ))}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5",
                serviceUp ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-500",
              )}
            >
              <Server className="h-3.5 w-3.5" />
              {!RESOLVER_URL ? "live status: not configured" : serviceUp ? "resolver service online" : "resolver service unreachable"}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        {!deployment ? (
          <p className="mt-10 text-gray-600">No deployment configured for this chain.</p>
        ) : statsError && !stats ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            <p className="font-semibold">Couldn&apos;t read the resolver network from chain.</p>
            <p className="mt-1 font-mono text-[11px] opacity-80">{(statsError as Error).message.split(String.fromCharCode(10))[0].slice(0, 200)}</p>
            <button type="button" onClick={() => refetch()} className="mt-3 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
              Try again
            </button>
          </div>
        ) : isLoading || !stats ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-violet-50" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {stats.resolvers.map((r) => (
                <NodeCard key={r.address} r={r} h={healthFor(r.address)} tier1Bond={tier1Bond as bigint | undefined} serviceUp={serviceUp} />
              ))}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <section className="rounded-2xl border border-violet-100 bg-white p-5">
                <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                  <Landmark className="h-3.5 w-3.5" /> Where market fees went
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Every fee is split per event: ⅓ resolvers who reported the final outcome, ⅓ committee voters who decided it (or the
                  insurance reserve when nobody disputed), ⅓ treasury. Totals from every allocation on-chain.
                </p>
                <div className="mt-5">
                  <FeeFlow flow={stats.flow} />
                </div>
              </section>

              <section className="grid gap-3">
                <div className="rounded-2xl border border-violet-100 bg-white p-5">
                  <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                    <KeyRound className="h-3.5 w-3.5" /> TreasuryVault balances
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Stat label="Treasury" value={`${fmtUsdg(stats.treasuryUsdg)}`} hint="USDG" />
                    <Stat label="Insurance" value={`${fmtUsdg(stats.insuranceUsdg)}`} hint="USDG · tops up committees" />
                  </div>
                  <div className="mt-2">
                    <Stat label="Dispute proceeds" value={eth(stats.vaultEth)} hint="treasury share of forfeited bonds, swept in" />
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-600 to-indigo-600 p-5 text-white">
                  <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-100">
                    <Activity className="h-3.5 w-3.5" /> Run a resolver
                  </p>
                  <p className="mt-2 text-sm text-violet-50">
                    One process per key: observe four live sources, vote in committees, claim your share of fees.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/docs/resolvers" className="link-plain rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-violet-700">
                      Operator guide
                    </Link>
                    <Link href="/disputes" className="link-plain inline-flex items-center gap-1 rounded-full border border-white/40 px-4 py-1.5 text-sm font-semibold text-white">
                      <Gavel className="h-3.5 w-3.5" /> Dispute Center
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
