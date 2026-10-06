"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  CHAINLINK_FEED_CATALOG,
  Comparator,
  encodeCorporateActionSpec,
  encodeFedRateSpec,
  encodePriceAtSpec,
  encodeTradingStatusSpec,
  feedBySymbol,
  matchesEvent,
  rankMatches,
  SOURCES,
  sourceId,
  STOCK_TOKENS_MAINNET,
  TradingSession,
  type EventSpecInput,
  type Hex,
} from "@novakoracle/sdk";
import { BarChart3, Building2, CandlestickChart, Code2, Landmark, Recycle, Rocket, ShieldOff, Sparkles } from "lucide-react";
import { deployment } from "@/lib/addresses";
import { useEvents, useNovakClient } from "@/lib/novak";
import { useLiveFeeds } from "@/lib/feeds";
import { specRows } from "@/lib/explorer";
import { useTx } from "@/lib/useTx";
import { CodeBlock } from "@/components/CodeBlock";
import { FeedSelect } from "@/components/markets/FeedSelect";
import { RangeTemplate } from "@/components/distribution/RangeTemplate";
import { ConnectButton } from "@/components/ConnectButton";
import { DotPattern } from "@/registry/magicui/dot-pattern";
import { toKnown } from "@/components/explorer/ReusePanel";
import { cn } from "@/lib/utils";

type Kind = "price" | "corporate" | "trading" | "fed" | "range";
const KINDS: { k: Kind; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { k: "price", label: "Price at a time", hint: "chainlink.price-at.v1", icon: CandlestickChart },
  { k: "corporate", label: "Corporate action", hint: "rh.corporate-action.v1", icon: Building2 },
  { k: "trading", label: "Trading halt", hint: "rh.trading-status.v1", icon: ShieldOff },
  { k: "fed", label: "Fed rate decision", hint: "macro.fomc.v1", icon: Landmark },
  { k: "range", label: "Range market", hint: "ladder + LMSR market", icon: BarChart3 },
];

const HOUR = 3600;
const DAY = 86_400;
const nowS = () => Math.floor(Date.now() / 1000);
const toLocal = (unix: number) => {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (s: string) => Math.floor(new Date(s).getTime() / 1000);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>}
  </label>
);
const inputCls = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

function bigintLit(v: bigint | number) {
  return `${v.toString()}n`;
}

function codeFor(kind: Exclude<Kind, "range">, spec: EventSpecInput, params: Record<string, string>) {
  const encoder = {
    price: `encodePriceAtSpec({
    feed: "${params.feed}", // ${params.symbol}/USD, Chainlink on Robinhood Chain mainnet
    threshold: ${params.threshold}, // ${params.thresholdHuman} (8 decimals)
    comparator: Comparator.${params.comparator},
    at: ${params.at},
    maxStaleness: ${params.maxStaleness},
  })`,
    corporate: `encodeCorporateActionSpec({
    stockToken: "${params.token}", // ${params.symbol} ERC-8056 stock token
    windowStart: ${params.windowStart},
    windowEnd: ${params.windowEnd},
    minChangeBps: ${params.minChangeBps},
  })`,
    trading: `encodeTradingStatusSpec({ symbol: "${params.symbol}", session: TradingSession.${params.session} })`,
    fed: `encodeFedRateSpec({ date: ${params.date}, upperBoundBps: ${params.bps}, comparator: Comparator.${params.comparator} })`,
  }[kind];
  const src = { price: "priceAt", corporate: "corporateAction", trading: "tradingStatus", fed: "fedRate" }[kind];
  const imp = { price: "encodePriceAtSpec, Comparator", corporate: "encodeCorporateActionSpec", trading: "encodeTradingStatusSpec, TradingSession", fed: "encodeFedRateSpec, Comparator" }[kind];

  const create = `import { NovakClient, getDeployment, robinhoodTestnet, SOURCES, sourceId, ${imp} } from "@novakoracle/sdk";

const novak = new NovakClient(publicClient, walletClient, getDeployment(robinhoodTestnet.id));

const tx = await novak.createEvent({
  specVersion: ${spec.specVersion},
  sourceId: sourceId(SOURCES.${src}),
  openTimestamp: ${bigintLit(spec.openTimestamp)},
  observationDeadline: ${bigintLit(spec.observationDeadline)},
  disputeWindowSeconds: ${bigintLit(spec.disputeWindowSeconds)},
  quorumThreshold: ${spec.quorumThreshold},
  spec: ${encoder},
}, account);
const eventId = await novak.getCreatedEventId(tx);`;

  const settle = `// Your AMM / prediction market's settlement job (off-chain, pull model).
const result = await novak.waitForOutcome(eventId, { intervalMs: 15_000 });

if (result.voided) {
  await amm.refundAll(marketId);          // Novak couldn't decide — refund, never guess
} else {
  await amm.settle(marketId, result.outcome);
}`;

  const solidity = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { NovakConsumer } from "novak/contracts/integrations/NovakConsumer.sol";

contract MyMarket is NovakConsumer {
    bytes32 public immutable eventId;

    constructor(bytes32 eventId_) NovakConsumer(${deployment?.eventBus ?? "0x…"}) { eventId = eventId_; }

    function deposit(bool yes) external payable whenNovakPending(eventId) { /* … */ }
    function settle() external { _settleWithNovak(eventId); }

    function _onNovakResolved(bytes32, bool outcome) internal override { /* pay winners */ }
    function _onNovakVoided(bytes32) internal override { /* refund: Novak never guesses */ }
}`;
  return [
    { id: "sdk", label: "1 · Create (SDK)", code: create, language: "ts" },
    { id: "settle", label: "2 · Settle your AMM", code: settle, language: "ts" },
    { id: "sol", label: "On-chain consumer", code: solidity, language: "solidity" },
  ];
}

export default function BuildPage() {
  const [kind, setKind] = useState<Kind>("price");
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const { run, pending, error } = useTx();
  const { data: feeds } = useLiveFeeds();
  const [created, setCreated] = useState<{ id: Hex; market?: Hex } | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const { data: events } = useEvents();

  // common
  const [disputeMin, setDisputeMin] = useState(30);
  const [quorum, setQuorum] = useState(2);
  // price
  const [symbol, setSymbol] = useState("NVDA");
  const [cmp, setCmp] = useState<Comparator>(Comparator.Gte);
  const [threshold, setThreshold] = useState<string>("");
  const [at, setAt] = useState(() => toLocal(nowS() + 2 * HOUR));
  const [staleH, setStaleH] = useState(72);
  // corporate
  const [cStart, setCStart] = useState(() => toLocal(nowS() - 40 * DAY));
  const [cEnd, setCEnd] = useState(() => toLocal(nowS() + 7 * DAY));
  const [minBps, setMinBps] = useState(0);
  // trading
  const [tSymbol, setTSymbol] = useState("NVDA");
  const [session, setSession] = useState<TradingSession>(TradingSession.Overnight);
  // fed
  const [fedDate, setFedDate] = useState("2026-10-29");
  const [fedBps, setFedBps] = useState(400);
  const [fedCmp, setFedCmp] = useState<Comparator>(Comparator.Lte);

  const feed = feedBySymbol(symbol);
  const live = feeds?.rows.find((r) => r.symbol === symbol)?.price ?? undefined;
  const thresholdNum = threshold === "" ? (live ? Math.round(live) : 0) : Number(threshold);

  const built = useMemo((): { spec: EventSpecInput; params: Record<string, string> } | null => {
    const n = nowS();
    const common = { disputeWindowSeconds: BigInt(Math.max(1, disputeMin) * 60), quorumThreshold: Math.max(1, quorum) };
    try {
      if (kind === "price" && feed) {
        const atS = fromLocal(at);
        const thr = BigInt(Math.round(thresholdNum * 10 ** feed.decimals));
        return {
          spec: {
            specVersion: 2,
            sourceId: sourceId(SOURCES.priceAt),
            openTimestamp: BigInt(atS),
            observationDeadline: BigInt(atS + DAY),
            ...common,
            spec: encodePriceAtSpec({ feed: feed.address, threshold: thr, comparator: cmp, at: BigInt(atS), maxStaleness: BigInt(staleH * HOUR) }),
          },
          params: {
            feed: feed.address,
            symbol,
            threshold: `${thr}n`,
            thresholdHuman: `$${thresholdNum.toLocaleString()}`,
            comparator: cmp === Comparator.Gte ? "Gte" : "Lte",
            at: `${atS}n`,
            maxStaleness: `${staleH * HOUR}n`,
          },
        };
      }
      if (kind === "corporate") {
        const token = STOCK_TOKENS_MAINNET.NVDA;
        const ws = fromLocal(cStart);
        const we = fromLocal(cEnd);
        return {
          spec: {
            specVersion: 2,
            sourceId: sourceId(SOURCES.corporateAction),
            openTimestamp: BigInt(n),
            observationDeadline: BigInt(Math.max(we, n) + DAY),
            ...common,
            spec: encodeCorporateActionSpec({ stockToken: token, windowStart: BigInt(ws), windowEnd: BigInt(we), minChangeBps: minBps }),
          },
          params: { token, symbol: "NVDA", windowStart: `${ws}n`, windowEnd: `${we}n`, minChangeBps: String(minBps) },
        };
      }
      if (kind === "trading") {
        return {
          spec: {
            specVersion: 1,
            sourceId: sourceId(SOURCES.tradingStatus),
            openTimestamp: BigInt(n),
            observationDeadline: BigInt(n + 15 * 60),
            ...common,
            spec: encodeTradingStatusSpec({ symbol: tSymbol.toUpperCase(), session }),
          },
          params: { symbol: tSymbol.toUpperCase(), session: TradingSession[session] },
        };
      }
      if (kind === "fed") {
        const d = Math.floor(new Date(`${fedDate}T00:00:00Z`).getTime() / 1000);
        return {
          spec: {
            specVersion: 2,
            sourceId: sourceId(SOURCES.fedRate),
            openTimestamp: BigInt(d + DAY),
            observationDeadline: BigInt(d + 8 * DAY),
            ...common,
            spec: encodeFedRateSpec({ date: BigInt(d), upperBoundBps: fedBps, comparator: fedCmp }),
          },
          params: { date: `${d}n`, bps: String(fedBps), comparator: fedCmp === Comparator.Gte ? "Gte" : "Lte" },
        };
      }
    } catch {
      return null;
    }
    return null;
  }, [kind, feed, at, thresholdNum, cmp, staleH, symbol, cStart, cEnd, minBps, tSymbol, session, fedDate, fedBps, fedCmp, disputeMin, quorum]);

  const question = !built
    ? ""
    : kind === "price"
      ? `Will ${symbol} be ${cmp === Comparator.Gte ? "at or above" : "at or below"} $${thresholdNum.toLocaleString()} at ${new Date(fromLocal(at) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}?`
      : kind === "corporate"
        ? `Will NVDA have a ${minBps ? `≥ ${minBps / 100}% ` : ""}corporate action take effect by ${new Date(fromLocal(cEnd) * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })}?`
        : kind === "trading"
          ? `Is ${tSymbol.toUpperCase()} halted in the ${["regular", "extended", "overnight"][session]} session right now?`
          : `Will the Fed's target upper bound be ${fedCmp === Comparator.Lte ? "at or below" : "at or above"} ${(fedBps / 100).toFixed(2)}% on ${fedDate}?`;
  const tabs = built && kind !== "range" ? codeFor(kind, built.spec, built.params) : [];

  // Reuse before you create: the same question (source + spec bytes) may already exist.
  const duplicates = useMemo(() => {
    if (!built || !events) return [];
    const known = events.map(toKnown).filter((e): e is NonNullable<typeof e> => e !== null);
    return rankMatches(known.filter((e) => matchesEvent(e, { sourceId: built.spec.sourceId, spec: built.spec.spec })));
  }, [built, events]);
  const titleOf = (id: Hex) => events?.find((e) => e.id === id)?.title ?? id;

  const create = () =>
    built &&
    client &&
    address &&
    run("Creating event", async (wait) => {
      const tx = await client.createEvent(built.spec, address);
      await wait(tx);
      const id = await client.getCreatedEventId(tx);
      setCreated({ id });
    });
  const createMarket = () =>
    created &&
    built &&
    client &&
    address &&
    run("Opening a market", async (wait) => {
      const tx = await client.createMarket(created.id, built.spec.openTimestamp, question.slice(0, 280), address);
      await wait(tx);
      setCreated({ ...created, market: await client.getCreatedMarketId(tx) });
    });

  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_80%_at_80%_30%,white,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
            <Code2 className="h-4 w-4" /> Builder console
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">Design a fact. Ship it to any market.</h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-700">
            Describe what should be resolved, see exactly what goes on-chain, and copy the code that plugs it into your own prediction
            market or AMM — or create it on Robinhood Chain testnet right here.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="mt-8 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {KINDS.map(({ k, label, hint, icon: Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCreated(null);
              }}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                kind === k ? "border-violet-500 bg-violet-600 text-white shadow-[0_12px_30px_-14px_rgba(109,74,255,0.8)]" : "border-gray-200 bg-white hover:border-violet-300",
              )}
            >
              <Icon className={cn("h-5 w-5", kind === k ? "text-violet-100" : "text-violet-600")} />
              <p className={cn("mt-2 text-sm font-semibold", kind === k ? "text-white" : "text-ink")}>{label}</p>
              <p className={cn("font-mono text-[10px]", kind === k ? "text-violet-200" : "text-gray-400")}>{hint}</p>
            </button>
          ))}
        </div>

        {kind === "range" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-violet-100 bg-white p-5">
              <p className="font-semibold text-ink">Range market on a live Chainlink price</p>
              <p className="mt-1 text-sm text-gray-600">Creates the N−1 boundary events in one transaction, then the LMSR market on top.</p>
              <div className="mt-4">
                <RangeTemplate />
              </div>
            </div>
            <CodeBlock
              variant="dark"
              label="the same thing with the SDK"
              code={`import { NovakClient, buildPriceLadderSpecs, feedBySymbol, getDeployment } from "@novakoracle/sdk";

const dep = getDeployment(46630);
const novak = new NovakClient(publicClient, walletClient, dep);
const at = BigInt(Math.floor(Date.now() / 1000) + 48 * 3600);
const thresholds = [230n, 232n, 234n, 236n, 238n].map((d) => d * 10n ** 8n);

const tx = await novak.createEvents(
  buildPriceLadderSpecs({ feed: feedBySymbol("NVDA")!.address, thresholds, at, maxStaleness: 4n * 3600n }),
  account,
);
const boundaries = await novak.getCreatedEventIds(tx);

const b = 500_000_000n; // 500 USDG liquidity
await novak.approveCollateralFor(dep.distributionMarket, novak.distributionSubsidy(b, 6), account);
await novak.createDistributionMarket("Where will NVDA be at the bell?", boundaries, at - 60n, b, account);`}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* form */}
            <div className="rounded-2xl border border-violet-100 bg-white p-5">
              <p className="font-semibold text-ink">Configure</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {kind === "price" && (
                  <>
                    <Field label="Asset" hint={live ? `live: $${live.toLocaleString()}` : `${CHAINLINK_FEED_CATALOG.length} Chainlink feeds`}>
                      <FeedSelect value={symbol} onChange={(s) => { setSymbol(s); setThreshold(""); }} />
                    </Field>
                    <Field label="Condition">
                      <div className="flex gap-2">
                        <select className={cn(inputCls, "w-20")} value={cmp} onChange={(e) => setCmp(Number(e.target.value) as Comparator)}>
                          <option value={Comparator.Gte}>≥</option>
                          <option value={Comparator.Lte}>≤</option>
                        </select>
                        <input className={inputCls} inputMode="decimal" value={threshold === "" ? String(thresholdNum) : threshold} onChange={(e) => setThreshold(e.target.value)} />
                      </div>
                    </Field>
                    <Field label="Measured at (T)" hint="the Chainlink round in effect at T">
                      <input type="datetime-local" className={inputCls} value={at} onChange={(e) => setAt(e.target.value)} />
                    </Field>
                    <Field label="Max staleness (hours)" hint="stock feeds hold the last price off-hours">
                      <input type="number" min={1} className={inputCls} value={staleH} onChange={(e) => setStaleH(Number(e.target.value))} />
                    </Field>
                  </>
                )}
                {kind === "corporate" && (
                  <>
                    <Field label="Stock token" hint="ERC-8056 token on Robinhood Chain mainnet">
                      <select className={inputCls} disabled>
                        <option>NVDA</option>
                      </select>
                    </Field>
                    <Field label="Minimum change" hint="0 = any (e.g. dividend); 10000 bps = a 2:1 split">
                      <input type="number" min={0} className={inputCls} value={minBps} onChange={(e) => setMinBps(Number(e.target.value))} />
                    </Field>
                    <Field label="Window start">
                      <input type="datetime-local" className={inputCls} value={cStart} onChange={(e) => setCStart(e.target.value)} />
                    </Field>
                    <Field label="Window end">
                      <input type="datetime-local" className={inputCls} value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
                    </Field>
                  </>
                )}
                {kind === "trading" && (
                  <>
                    <Field label="Symbol" hint="as listed in Robinhood's asset registry">
                      <input className={inputCls} value={tSymbol} onChange={(e) => setTSymbol(e.target.value)} />
                    </Field>
                    <Field label="Session" hint="snapshot: resolvers observe within 15 minutes">
                      <select className={inputCls} value={session} onChange={(e) => setSession(Number(e.target.value) as TradingSession)}>
                        <option value={TradingSession.Market}>Regular hours</option>
                        <option value={TradingSession.Extended}>Extended hours</option>
                        <option value={TradingSession.Overnight}>Overnight</option>
                      </select>
                    </Field>
                  </>
                )}
                {kind === "fed" && (
                  <>
                    <Field label="Decision checked on (UTC day)" hint="the day after the FOMC statement">
                      <input type="date" className={inputCls} value={fedDate} onChange={(e) => setFedDate(e.target.value)} />
                    </Field>
                    <Field label="Upper bound of the target range" hint="in bps — 400 = 4.00%">
                      <div className="flex gap-2">
                        <select className={cn(inputCls, "w-20")} value={fedCmp} onChange={(e) => setFedCmp(Number(e.target.value) as Comparator)}>
                          <option value={Comparator.Lte}>≤</option>
                          <option value={Comparator.Gte}>≥</option>
                        </select>
                        <input type="number" className={inputCls} value={fedBps} onChange={(e) => setFedBps(Number(e.target.value))} />
                      </div>
                    </Field>
                  </>
                )}
                <Field label="Dispute window (minutes)" hint="how long anyone can challenge the quorum's answer">
                  <input type="number" min={1} className={inputCls} value={disputeMin} onChange={(e) => setDisputeMin(Number(e.target.value))} />
                </Field>
                <Field label="Quorum" hint="identical answers needed (3 resolvers today)">
                  <input type="number" min={1} max={3} className={inputCls} value={quorum} onChange={(e) => setQuorum(Number(e.target.value))} />
                </Field>
              </div>

              {built && (
                <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                  <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                    <Sparkles className="h-3.5 w-3.5" /> Preview
                  </p>
                  <p className="mt-1 text-lg font-semibold text-ink">{question}</p>
                  <dl className="mt-3 divide-y divide-violet-100 text-xs">
                    {specRows(built.spec).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[110px_1fr] gap-2 py-1.5">
                        <dt className="font-mono uppercase text-gray-500">{k}</dt>
                        <dd className="text-gray-800 [overflow-wrap:anywhere]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {duplicates.length > 0 && !created && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                    <Recycle className="h-4 w-4" /> This exact question already exists on Novak
                  </p>
                  <p className="mt-1 text-amber-900/80">
                    Reuse it — it&apos;s already being observed and can be disputed, and every market that reads it settles on the same answer.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {duplicates.slice(0, 3).map((d) => (
                      <li key={d.eventId}>
                        <Link href={`/events/${d.eventId}`} className="link-plain flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200 hover:ring-violet-300">
                          <span className="min-w-0 truncate text-ink">{titleOf(d.eventId)}</span>
                          <span className="shrink-0 font-semibold text-violet-700">Reuse →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-3 flex items-center gap-2 text-xs text-amber-900/80">
                    <input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} /> I still want a separate event
                  </label>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {!isConnected ? (
                  <>
                    <span className="text-sm text-gray-600">Connect to create it on testnet:</span>
                    <ConnectButton />
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!built || Boolean(pending) || Boolean(created) || (duplicates.length > 0 && !dupOk)}
                    onClick={create}
                    className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Rocket className="h-4 w-4" /> {pending ?? "Create event on testnet"}
                  </button>
                )}
              </div>
              {error && <p className="mt-2 font-mono text-[11px] text-rose-700">{error}</p>}
              {created && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <p className="font-semibold text-emerald-900">Event created — resolvers will pick it up automatically.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/events/${created.id}`} className="link-plain rounded-full bg-white px-3 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      View event & history →
                    </Link>
                    {created.market ? (
                      <Link href={`/markets/${created.market}`} className="link-plain rounded-full bg-emerald-600 px-3 py-1.5 font-semibold text-white">
                        Open the market →
                      </Link>
                    ) : (
                      <button type="button" disabled={Boolean(pending)} onClick={createMarket} className="rounded-full bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                        {pending ?? "Open a yes/no market on it"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* code */}
            <div className="min-w-0">
              {tabs.length > 0 && <CodeBlock variant="dark" tabs={tabs} />}
              <p className="mt-3 text-xs text-gray-500">
                Addresses come from <code>getDeployment(46630)</code> in the SDK. Full guide:{" "}
                <Link href="/docs/integrate" className="text-violet-700 underline">
                  Integrate your market
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
