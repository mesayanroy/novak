"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { DistributionStatus, distributionMarketAbi, explorerUrl, feedByAddress, type Hex } from "@novakoracle/sdk";
import { AssetBadge } from "@/components/markets/AssetIcon";
import { EventStatusPill } from "@/components/StatusPill";
import { NOVAK_CHAIN_ID, novakAddresses } from "@/lib/addresses";
import { fmtTime, fmtUsdg } from "@/lib/novak";
import { modelBucketProbabilities, useDistributionMarket, useFeedHistory, useTrades } from "@/lib/distribution";
import { DistributionChart } from "./DistributionChart";
import { TradePanel } from "./TradePanel";
import { InsightsPanel } from "./InsightsPanel";
import { ActivityFeed } from "./ActivityFeed";
import { LivePriceChart } from "@/components/markets/LivePriceChart";
import { DisputePanel } from "@/components/disputes/DisputePanel";
import { ArrowLeft } from "lucide-react";

const DEFAULT_VOL: Record<string, number> = { SGOV: 0.01 };

export function DistributionMarketView({ marketId }: { marketId: Hex }) {
  const { data: view, isLoading, error } = useDistributionMarket(marketId);
  const { data: trades } = useTrades(marketId);
  const { data: history } = useFeedHistory(view?.feed);
  const { address } = useAccount();
  const [bucket, setBucket] = useState(0);
  const { data: held } = useReadContract({
    address: novakAddresses.distributionMarket,
    abi: distributionMarketAbi,
    functionName: "sharesOf",
    args: address ? [marketId, address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });

  const spot = history?.rounds.length ? history.rounds[history.rounds.length - 1].price : undefined;
  const vol = history?.annualVol ?? DEFAULT_VOL[view?.ticker ?? ""] ?? 0.4;
  const model = useMemo(() => {
    if (!view || spot === undefined || view.thresholds.length === 0 || view.at === undefined) return undefined;
    const years = (Number(view.at) - Date.now() / 1000) / (365 * 24 * 3600);
    return modelBucketProbabilities(spot, vol, years, view.thresholds);
  }, [view, spot, vol]);
  const spotBucket = spot !== undefined && view ? view.thresholds.filter((t) => spot >= t).length : undefined;
  const explorer = explorerUrl(NOVAK_CHAIN_ID);

  if (isLoading) return <p className="mx-auto max-w-6xl px-6 py-16 font-mono text-sm text-gray-500">Loading market from chain…</p>;
  if (error || !view || view.createdAt === 0n) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 text-sm text-gray-600">
        Distribution market not found on chain {NOVAK_CHAIN_ID}. <Link href="/markets" className="underline">Back to markets</Link>
      </div>
    );
  }

  const statusText =
    view.status === DistributionStatus.Settled
      ? `Settled — winning range ${view.labels[view.winningBucket]}`
      : view.status === DistributionStatus.Voided
        ? "Voided — every share redeems 1/N USDG"
        : BigInt(Math.floor(Date.now() / 1000)) < view.tradingClosesAt
          ? `Trading open · closes ${fmtTime(view.tradingClosesAt)}`
          : "Trading closed · resolving";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/markets" className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to markets
      </Link>

      <div className="relative mt-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6">
        <div className="mb-3 sm:absolute sm:right-5 sm:top-5 sm:mb-0">
          <AssetBadge ticker={view.ticker} category={view.boundaries[0]?.category} name={view.feed ? feedByAddress(view.feed)?.name : undefined} />
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Distribution market · {view.ticker} · {statusText}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:pr-56 sm:text-3xl">{view.question.split(" (")[0]}</h1>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-gray-600">
          {view.at !== undefined && <span>Resolves on the Chainlink round in effect at {fmtTime(view.at)}</span>}
          <span>Liquidity b = {fmtUsdg(view.b)} USDG</span>
          <span>Reserve {fmtUsdg(view.reserve)} USDG</span>
          <span>Fees so far {fmtUsdg(view.fees)} USDG → TreasuryVault</span>
          {explorer && (
            <a className="underline" href={`${explorer}/address/${novakAddresses.distributionMarket}`} target="_blank" rel="noreferrer">
              Contract ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <LivePriceChart feed={view.feed} ticker={view.ticker} thresholds={view.thresholds} />
          <DistributionChart
            labels={view.labels}
            prices={view.prices}
            model={view.status === DistributionStatus.Open ? model : undefined}
            spotBucket={spotBucket}
            winningBucket={view.status === DistributionStatus.Settled ? view.winningBucket : undefined}
            selected={bucket}
            onSelect={setBucket}
          />
          {view.status === DistributionStatus.Open && (
            <InsightsPanel view={view} model={model} spot={spot} annualVol={history?.annualVol} held={[...((held as readonly bigint[] | undefined) ?? [])]} />
          )}
          <ActivityFeed trades={trades ?? []} labels={view.labels} startPrices={view.labels.map(() => 1 / view.nBuckets)} />

          <div className="rounded-2xl border border-violet-100 bg-white p-5">
            <p className="font-semibold text-ink">How this resolves (the dispute layer)</p>
            <p className="mt-1 text-sm text-gray-600">
              Each range boundary is its own yes/no Novak event. Independent resolvers read the Chainlink round at T and
              must agree (quorum); anyone can dispute within the window, escalating to bonded Tier-1 (≤7) and Tier-2 (≤15)
              committees that need 66% agreement — never a token vote. Winning range = number of boundaries that resolved
              YES. Fees are split by the TreasuryVault: ⅓ to resolvers who reported correctly, ⅓ to committee members who
              voted correctly (or an insurance reserve), ⅓ to the treasury.
            </p>
            <ul className="mt-3 space-y-1.5">
              {view.boundaries.map((b) => (
                <li key={b.id} className="border-t border-gray-100 pt-1.5 text-sm">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                      <span className="text-ink group-open:font-semibold">{b.title}</span>
                      <span className="flex items-center gap-2">
                        {b.status !== undefined && <EventStatusPill status={b.status} />}
                        <span className="font-mono text-[11px] text-violet-600 group-open:hidden">dispute layer ▾</span>
                      </span>
                    </summary>
                    <div className="mt-2">
                      <DisputePanel eventId={b.id} compact />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <TradePanel view={view} bucket={bucket} onBucket={setBucket} />
        </aside>
      </div>
    </div>
  );
}
