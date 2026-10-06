"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther, isAddress, type Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { DistributionStatus, disputeManagerAbi, EventStatus, explorerUrl, MarketStatus } from "@novakoracle/sdk";
import {
  Activity as ActivityIcon,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Coins,
  Eye,
  Gavel,
  LayoutDashboard,
  Layers,
  ListChecks,
  PieChart,
  Rocket,
  Scale,
  Sparkles,
  Table2,
  Wallet,
} from "lucide-react";
import { deployment, NOVAK_CHAIN_ID } from "@/lib/addresses";
import { fmtTime, fmtUsdg, tickersOf, useNovakClient } from "@/lib/novak";
import { usePortfolio, type Position } from "@/lib/portfolio";
import { useActivity, type ActivityItem, type PositionStats } from "@/lib/activity";
import { useSetupProgress } from "@/lib/setup";
import { useTx } from "@/lib/useTx";
import { activeChain } from "@/lib/wagmi";
import { AssetStack } from "@/components/markets/AssetIcon";
import { ConnectButton } from "@/components/ConnectButton";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { Donut, SERIES, Sparkline, toSlices, ValueChart } from "@/components/portfolio/charts";
import { cn } from "@/lib/utils";

const f6 = (v: bigint) => Number(v) / 1e6;
const usd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const idOf = (p: Position) => (p.kind === "binary" ? p.market.marketId : p.view.marketId);
const titleOf = (p: Position) => (p.kind === "binary" ? p.market.question || p.market.event.title : p.view.question.split(" (")[0]);
const hrefOf = (p: Position) => (p.kind === "binary" ? `/markets/${p.market.marketId}` : `/markets/dist/${p.view.marketId}`);
const tickersFor = (p: Position) => (p.kind === "binary" ? tickersOf(p.market.event) : p.view.ticker ? [p.view.ticker] : []);
const isOpen = (p: Position) => (p.kind === "binary" ? p.market.status === MarketStatus.Open : p.view.status === DistributionStatus.Open);
const closesAt = (p: Position) => Number(p.kind === "binary" ? p.market.tradingClosesAt : p.view.tradingClosesAt);
const collected = (p: Position) => (p.kind === "binary" ? p.claimed : p.redeemed);

/** What a position is worth now: mark (open), payout (decided, uncollected), 0 once collected. */
function currentOf(p: Position): number {
  if (p.payout > 0n) return f6(p.payout);
  if (isOpen(p)) return p.kind === "range" ? f6(p.value) : f6(p.yes + p.no);
  return 0;
}

function statusOf(p: Position): { label: string; tone: "live" | "wait" | "ready" | "done" } {
  if (p.payout > 0n) return { label: "ready to collect", tone: "ready" };
  if (isOpen(p)) return closesAt(p) * 1000 > Date.now() ? { label: `trading · closes ${fmtTime(closesAt(p))}`, tone: "live" } : { label: "resolving on Novak", tone: "wait" };
  if (p.kind === "binary") return { label: p.market.status === MarketStatus.Refunding ? "voided · refunded" : `settled ${p.market.outcome ? "YES" : "NO"}`, tone: "done" };
  return { label: p.view.status === DistributionStatus.Voided ? "voided · 1/N per share" : `settled · ${p.view.labels[p.view.winningBucket]}`, tone: "done" };
}

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "holdings", label: "Holdings", icon: Table2 },
  { id: "allocation", label: "Allocation", icon: PieChart },
  { id: "collect", label: "Collect", icon: Coins },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "protocol", label: "On Novak", icon: Scale },
  { id: "setup", label: "Setup", icon: ListChecks },
] as const;

function Panel({ id, title, icon: Icon, action, children, className }: { id?: string; title: string; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(109,74,255,0.5)]", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Icon className="h-4 w-4 text-violet-600" /> {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Delta({ v, pct }: { v: number; pct?: number }) {
  const up = v >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-emerald-700" : "text-rose-700")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? "+" : "−"}
      {usd(Math.abs(v))}
      {pct !== undefined && Number.isFinite(pct) && <span className="font-normal opacity-80"> ({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)</span>}
    </span>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-transparent bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 text-white shadow-[0_18px_44px_-24px_rgba(109,74,255,0.9)]" : "border-violet-100 bg-white")}>
      <p className={cn("font-mono text-[10px] uppercase tracking-wide", accent ? "text-violet-100" : "text-gray-500")}>{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight sm:text-[1.7rem]", accent ? "text-white" : "text-ink")}>{value}</p>
      {sub && <div className={cn("mt-1 text-xs", accent ? "text-violet-100 [&_.text-emerald-700]:text-emerald-200 [&_.text-rose-700]:text-rose-200" : "text-gray-500")}>{sub}</div>}
    </div>
  );
}

const ACT: Record<ActivityItem["kind"], { label: string; cls: string }> = {
  buy: { label: "Bought", cls: "bg-violet-50 text-violet-700" },
  sell: { label: "Sold", cls: "bg-cyan-50 text-cyan-700" },
  deposit: { label: "Backed", cls: "bg-violet-50 text-violet-700" },
  withdraw: { label: "Withdrew", cls: "bg-cyan-50 text-cyan-700" },
  collect: { label: "Collected", cls: "bg-emerald-50 text-emerald-700" },
  dispute: { label: "Disputed", cls: "bg-amber-50 text-amber-700" },
  reward: { label: "Reward", cls: "bg-emerald-50 text-emerald-700" },
};

export default function PortfolioPage() {
  const { address: connected, isConnected } = useAccount();
  const [viewAs, setViewAs] = useState<Address | undefined>();
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("address");
    if (a && isAddress(a)) setViewAs(a);
  }, []);
  const who = viewAs ?? connected;
  const readOnly = Boolean(viewAs && viewAs.toLowerCase() !== connected?.toLowerCase());

  const client = useNovakClient();
  const setup = useSetupProgress();
  const { data, isLoading } = usePortfolio(who);
  const { data: act, isLoading: actLoading } = useActivity(who, data);
  const { run, pending, error } = useTx();
  const { writeContractAsync } = useWriteContract();
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [data, act]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.positions.map((p) => {
      const st: PositionStats | undefined = act?.stats[idOf(p)];
      const invested = st ? f6(st.invested) : p.kind === "binary" ? f6(p.yes + p.no) : f6(p.value);
      const done = st ? f6(st.collected) : 0;
      const current = currentOf(p);
      const ret = current + done - invested;
      return { p, st, invested, current, done, ret, pct: invested > 0 ? (ret / invested) * 100 : 0, status: statusOf(p) };
    });
  }, [data, act]);

  const totals = useMemo(() => {
    const value = rows.reduce((s, r) => s + r.current, 0);
    const invested = rows.reduce((s, r) => s + r.invested, 0);
    const ret = rows.reduce((s, r) => s + r.ret, 0);
    const realized = rows.filter((r) => !isOpen(r.p)).reduce((s, r) => s + r.ret, 0);
    return { value, invested, ret, realized, unrealized: ret - realized, pct: invested > 0 ? (ret / invested) * 100 : 0 };
  }, [rows]);

  const byAsset = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = tickersFor(r.p).join(" + ") || "Other";
      m.set(k, (m.get(k) ?? 0) + r.current);
    });
    return toSlices([...m].map(([label, value]) => ({ label, value })));
  }, [rows]);
  const byType = useMemo(
    () =>
      toSlices([
        { label: "Range markets (LMSR)", value: rows.filter((r) => r.p.kind === "range").reduce((s, r) => s + r.current, 0) },
        { label: "Yes/no markets", value: rows.filter((r) => r.p.kind === "binary").reduce((s, r) => s + r.current, 0) },
      ]),
    [rows],
  );
  const byState = useMemo(
    () =>
      toSlices([
        { label: "Trading", value: rows.filter((r) => r.status.tone === "live").reduce((s, r) => s + r.current, 0) },
        { label: "Resolving on Novak", value: rows.filter((r) => r.status.tone === "wait").reduce((s, r) => s + r.current, 0) },
        { label: "Ready to collect", value: rows.filter((r) => r.status.tone === "ready").reduce((s, r) => s + r.current, 0) },
      ]),
    [rows],
  );

  // The Novak events your positions settle on.
  const events = useMemo(() => {
    const seen = new Map<string, number | undefined>();
    data?.positions.forEach((p) => {
      if (p.kind === "binary") seen.set(p.market.event.id, p.market.event.status);
      else p.view.boundaries.forEach((b) => seen.set(b.id, b.status));
    });
    const st = [...seen.values()];
    return {
      total: st.length,
      finalized: st.filter((s) => s === EventStatus.Finalized).length,
      disputed: st.filter((s) => s === EventStatus.Disputed).length,
      voided: st.filter((s) => s === EventStatus.Voided || s === EventStatus.Expired).length,
    };
  }, [data]);

  const collect = (p: Position) => (p.kind === "binary" ? client!.claim(p.market.marketId, who!) : client!.distributionRedeem(p.view.marketId, who!));
  const withdrawEth = () => writeContractAsync({ address: deployment!.disputeManager, abi: disputeManagerAbi, functionName: "withdraw", chainId: activeChain.id });
  const collectAll = () =>
    run("Collecting", async (wait) => {
      for (const p of data!.claimable) await wait(await collect(p));
      if (data!.disputeEthOwed > 0n) await wait(await withdrawEth());
    });
  const nReady = (data?.claimable.length ?? 0) + (data && data.disputeEthOwed > 0n ? 1 : 0);
  const fees = act ? f6(act.feesPaid) : 0;

  if (!who) {
    return (
      <main className="relative overflow-x-clip pb-20">
        <div className="mx-auto mt-10 grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white p-8">
            <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
              <LayoutDashboard className="h-4 w-4" /> Portfolio
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">Connect to see your positions</p>
            <p className="mt-2 text-gray-600">Everything here is read from your address on-chain: positions, cost basis, returns, what you can collect. No account, no database.</p>
            <div className="mt-6">
              <ConnectButton />
            </div>
          </div>
          <div id="setup">
            <SetupChecklist variant="page" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-x-clip bg-gradient-to-b from-violet-50/50 via-white to-white pb-20">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pt-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ---- sidebar ---- */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <nav className="rounded-2xl border border-violet-100 bg-white p-2 shadow-[0_10px_30px_-24px_rgba(109,74,255,0.5)]" aria-label="Portfolio sections">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={cn(
                    "link-plain flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                    active === id ? "bg-violet-600 text-white shadow-[0_8px_20px_-10px_rgba(109,74,255,0.9)]" : "text-gray-600 hover:bg-violet-50 hover:text-violet-700",
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                  {id === "collect" && nReady > 0 && <span className={cn("ml-auto rounded-full px-1.5 text-[10px] font-bold", active === id ? "bg-white text-violet-700" : "bg-emerald-100 text-emerald-700")}>{nReady}</span>}
                  {id === "setup" && setup.ready && !setup.complete && (
                    <span className={cn("ml-auto font-mono text-[10px]", active === id ? "text-violet-100" : "text-gray-400")}>
                      {setup.done}/{setup.total}
                    </span>
                  )}
                </a>
              ))}
            </nav>
            {!readOnly && (
              <div className="rounded-2xl border border-violet-100 bg-white p-4">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
                  <Wallet className="h-3.5 w-3.5" /> Buying power
                </p>
                <p className="mt-1 text-xl font-bold text-ink">{setup.usdgBalance !== undefined ? fmtUsdg(setup.usdgBalance) : "…"} <span className="text-xs font-medium text-gray-500">USDG</span></p>
                <p className="font-mono text-[11px] text-gray-500">{setup.ethBalance !== undefined ? `${Number(formatEther(setup.ethBalance)).toFixed(4)} ETH gas` : ""}</p>
                <Link href="/markets" className="link-plain mt-3 flex items-center justify-center gap-1.5 rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                  Trade a range <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* ---- main ---- */}
        <div className="min-w-0 space-y-6">
          <header id="overview" className="scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Portfolio</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {isLoading || !data ? "…" : usd(totals.value)}
                  <span className="ml-2 align-middle text-base font-medium text-gray-500">USDG</span>
                </h1>
                {data && totals.invested > 0 && (
                  <p className="mt-1 text-sm text-gray-600">
                    <Delta v={totals.ret} pct={totals.pct} /> all-time return on {usd(totals.invested)} invested
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {readOnly && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-mono text-[11px] text-amber-800 ring-1 ring-amber-200">
                    <Eye className="h-3.5 w-3.5" /> read-only view
                  </span>
                )}
                <a
                  href={explorer ? `${explorer}/address/${who}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="link-plain rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-[11px] text-gray-600 hover:border-violet-300"
                >
                  {who.slice(0, 6)}…{who.slice(-4)} ↗
                </a>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Tile accent label="Portfolio value" value={data ? usd(totals.value) : "…"} sub={data ? `${data.open.length} open · ${data.positions.length} total positions` : ""} />
              <Tile label="Net invested" value={data ? usd(totals.invested) : "…"} sub="cash in − cash out, from your trades" />
              <Tile label="Total returns" value={data ? `${totals.ret >= 0 ? "+" : "−"}${usd(Math.abs(totals.ret))}` : "…"} sub={data ? <span>realized {usd(totals.realized)} · unrealized {usd(totals.unrealized)}</span> : ""} />
              <Tile
                label="Ready to collect"
                value={data ? usd(f6(data.claimableUsdg)) : "…"}
                sub={data && data.disputeEthOwed > 0n ? `+ ${Number(formatEther(data.disputeEthOwed)).toFixed(4)} ETH dispute credits` : "USDG from settled markets"}
              />
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <Panel title="Value over time" icon={Sparkles}>
              {actLoading && !act ? <div className="h-[330px] animate-pulse rounded-xl bg-violet-50" /> : <ValueChart history={act?.history ?? []} />}
              <p className="mt-2 text-[11px] text-gray-500">Rebuilt from every Trade, deposit, settlement and claim log on your markets. Past points mark range positions at the LMSR price of the time; the latest point is what you'd receive selling now (after fee and price impact).</p>
            </Panel>
            <Panel id="allocation" title="Allocation by asset" icon={PieChart}>
              <Donut slices={byAsset} center={usd(totals.value)} stacked />
            </Panel>
          </div>

          <Panel
            id="holdings"
            title="Holdings"
            icon={Table2}
            action={
              <Link href="/markets" className="link-plain inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                Browse markets <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {isLoading || !data ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-violet-50" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-10 text-center">
                <p className="text-lg font-semibold text-ink">No positions yet</p>
                <p className="mt-1 text-gray-600">Take a view on where NVDA, TSLA or SGOV will land. Every market settles on Novak&apos;s dispute layer.</p>
                <Link href="/markets" className="link-plain mt-5 inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
                  Browse markets <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left font-mono text-[10px] uppercase tracking-wide text-gray-500">
                      <th className="pb-2 pr-3 font-medium">Market</th>
                      <th className="pb-2 pr-3 font-medium">Position</th>
                      <th className="pb-2 pr-3 text-right font-medium">Mkt price</th>
                      <th className="pb-2 pr-3 text-right font-medium">Invested</th>
                      <th className="pb-2 pr-3 text-right font-medium">Current</th>
                      <th className="pb-2 pr-3 text-right font-medium">Returns</th>
                      <th className="pb-2 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, st, invested, current, done, ret, pct, status }) => (
                      <tr key={idOf(p)} className="border-b border-gray-50 last:border-0 hover:bg-violet-50/40">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <AssetStack tickers={tickersFor(p)} size={34} />
                            <div className="min-w-0">
                              <Link href={hrefOf(p)} className="link-plain block max-w-[260px] truncate font-semibold text-ink hover:text-violet-700">
                                {titleOf(p)}
                              </Link>
                              <span className="flex items-center gap-1.5">
                                <span className="rounded bg-gray-100 px-1.5 font-mono text-[9px] uppercase text-gray-600">{p.kind === "binary" ? "yes/no" : "range"}</span>
                                <span
                                  className={cn(
                                    "font-mono text-[10px]",
                                    status.tone === "ready" ? "text-emerald-700" : status.tone === "wait" ? "text-amber-700" : status.tone === "live" ? "text-violet-700" : "text-gray-500",
                                  )}
                                >
                                  {status.label}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          {p.kind === "binary" ? (
                            <span className="flex flex-wrap gap-1">
                              {p.yes > 0n && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">YES {fmtUsdg(p.yes)}</span>}
                              {p.no > 0n && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[11px] text-rose-700">NO {fmtUsdg(p.no)}</span>}
                            </span>
                          ) : (
                            <span className="flex max-w-[220px] flex-wrap gap-1">
                              {p.shares.map((s, b) =>
                                s > 0n ? (
                                  <span key={b} className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", p.view.status === DistributionStatus.Settled && b === p.view.winningBucket ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700")}>
                                    {p.view.labels[b]} · {(Number(s) / 1e6).toFixed(1)}
                                  </span>
                                ) : null,
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <span className="font-semibold text-ink">{st ? `${Math.round(st.price * 100)}¢` : "—"}</span>
                          {st?.outcome && <span className="block font-mono text-[10px] text-gray-500">{st.outcome}</span>}
                        </td>
                        <td className="py-3 pr-3 text-right font-medium text-gray-800">{usd(invested)}</td>
                        <td className="py-3 pr-3 text-right">
                          <span className="font-semibold text-ink">{usd(current > 0 ? current : done)}</span>
                          {current === 0 && done > 0 && <span className="block font-mono text-[10px] text-gray-500">collected</span>}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <Delta v={ret} />
                          <span className="block font-mono text-[10px] text-gray-500">{invested > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : ""}</span>
                        </td>
                        <td className="py-3">
                          <Sparkline points={st?.spark ?? []} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="By market type" icon={Layers}>
              <Donut slices={byType} center={usd(totals.value)} size={150} />
            </Panel>
            <Panel title="By lifecycle" icon={Rocket}>
              <Donut slices={byState} center={usd(totals.value)} size={150} />
            </Panel>
          </div>

          <Panel
            id="collect"
            title="Ready to collect"
            icon={BadgeCheck}
            action={
              nReady > 0 && !readOnly ? (
                <button
                  type="button"
                  disabled={Boolean(pending) || !client}
                  onClick={collectAll}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Coins className="h-4 w-4" /> {pending ? `${pending}…` : `Collect all (${nReady})`}
                </button>
              ) : null
            }
          >
            {error && <p className="mb-2 font-mono text-[11px] text-rose-700">{error}</p>}
            {nReady === 0 ? (
              <p className="text-sm text-gray-500">Nothing to collect right now. Winnings, voided-market refunds and returned dispute bonds show up here as soon as Novak finalizes.</p>
            ) : (
              <ul className="space-y-2">
                {data!.claimable.map((p) => (
                  <li key={idOf(p)} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
                    <AssetStack tickers={tickersFor(p)} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{titleOf(p)}</p>
                      <p className="font-mono text-[10px] text-gray-500">{statusOf(p).label}</p>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={Boolean(pending) || !client}
                        onClick={() => run(p.kind === "binary" ? "Claiming" : "Redeeming", async (wait) => wait(await collect(p)))}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {p.kind === "binary" ? "Claim" : "Redeem"} {fmtUsdg(p.payout)} USDG
                      </button>
                    )}
                  </li>
                ))}
                {data!.disputeEthOwed > 0n && (
                  <li className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <Gavel className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">Dispute bonds &amp; committee rewards</p>
                      <p className="font-mono text-[10px] text-gray-500">credited by the DisputeManager · pull-based</p>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={Boolean(pending)}
                        onClick={() => run("Withdrawing", async (wait) => wait(await withdrawEth()))}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Withdraw {Number(formatEther(data!.disputeEthOwed)).toFixed(4)} ETH
                      </button>
                    )}
                  </li>
                )}
              </ul>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Panel id="activity" title="Activity" icon={ActivityIcon}>
              {!act ? (
                <div className="h-40 animate-pulse rounded-xl bg-violet-50" />
              ) : act.items.length === 0 ? (
                <p className="text-sm text-gray-500">No trades yet.</p>
              ) : (
                <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                  {act.items.slice(0, 40).map((it) => {
                    const pos = data?.positions.find((p) => idOf(p) === it.marketId);
                    const what =
                      it.kind === "dispute" || it.kind === "reward"
                        ? `event ${it.eventId?.slice(0, 10)}…`
                        : pos
                          ? `${titleOf(pos)}${it.bucket !== undefined && pos.kind === "range" ? ` · ${pos.view.labels[it.bucket]}` : it.side ? ` · ${it.side}` : ""}`
                          : `market ${it.marketId?.slice(0, 10)}…`;
                    const amount = it.kind === "dispute" ? `${Number(formatEther(it.amount)).toFixed(4)} ETH bond` : `${fmtUsdg(it.amount)} USDG`;
                    return (
                      <li key={`${it.tx}-${it.kind}-${it.bucket ?? ""}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-violet-50/50">
                        <span className={cn("w-20 flex-none rounded-full px-2 py-0.5 text-center font-mono text-[10px] font-semibold", ACT[it.kind].cls)}>{ACT[it.kind].label}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{what}</span>
                        <span className="flex-none text-right">
                          <span className="block text-sm font-semibold text-ink">{amount}</span>
                          <a href={explorer ? `${explorer}/tx/${it.tx}` : undefined} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-gray-400 hover:text-violet-700">
                            {it.time ? fmtTime(it.time) : "tx"} ↗
                          </a>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel id="protocol" title="Your footprint on Novak" icon={Scale}>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-gray-600">Trading fees paid</span>
                    <span className="font-semibold text-ink">{act ? usd(fees) : "…"}</span>
                  </div>
                  <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                    {fees > 0 && SERIES.slice(0, 3).map((c) => <span key={c} className="h-full flex-1" style={{ background: c }} />)}
                  </div>
                  <ul className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    {["Correct resolvers", "Committee / insurance", "Treasury"].map((l, i) => (
                      <li key={l}>
                        <span className="flex items-center gap-1 text-gray-500">
                          <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i] }} /> {l}
                        </span>
                        <span className="font-semibold text-ink">{usd(fees / 3)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-gray-500">Every fee is split in thirds per event by the TreasuryVault.</p>
                </div>
                <dl className="divide-y divide-gray-100 border-t border-gray-100">
                  {[
                    ["Novak events your positions settle on", `${events.total}`, `${events.finalized} finalized · ${events.disputed} disputed · ${events.voided} voided`],
                    ["Disputes you filed", act ? String(act.disputesFiled) : "…", act && act.disputesFiled > 0 ? `${Number(formatEther(act.disputeBondsWei)).toFixed(4)} ETH bonded` : "challenge any proposed answer in the Dispute Center"],
                    ["Dispute credits owed", data ? `${Number(formatEther(data.disputeEthOwed)).toFixed(4)} ETH` : "…", "returned bonds + committee rewards"],
                    ["Vault rewards claimed", act ? `${fmtUsdg(act.rewardsClaimed)} USDG` : "…", "for resolvers and committee members"],
                  ].map(([k, v, h]) => (
                    <div key={k} className="flex items-start justify-between gap-3 py-2.5">
                      <dt className="text-gray-600">
                        {k}
                        <span className="block text-[11px] text-gray-400">{h}</span>
                      </dt>
                      <dd className="flex-none font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Link href="/disputes" className="link-plain inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                  Open the Dispute Center <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Panel>
          </div>

          {!readOnly && (
            <div id="setup" className="scroll-mt-24">
              <SetupChecklist variant="page" />
            </div>
          )}
        </div>
      </div>
      {!isConnected && viewAs && (
        <div className="mx-auto mt-6 max-w-7xl px-4 text-sm text-gray-500 sm:px-6">
          Viewing {viewAs} read-only. <ConnectButton />
        </div>
      )}
    </main>
  );
}
