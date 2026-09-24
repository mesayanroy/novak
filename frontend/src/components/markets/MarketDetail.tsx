"use client";

import Link from "next/link";
import type { Hex } from "@novak/sdk";
import { CompositionTree, type CompositionNode } from "@/components/markets/CompositionTree";
import { MarketPositionCard } from "@/components/MarketPositionCard";
import { SettlementSimulator } from "@/components/markets/SettlementSimulator";
import { MarketStatusLabel } from "@/components/markets/MarketCard";
import { explorerUrl, marketAbi } from "@novak/sdk";
import { useReadContract } from "wagmi";
import { NOVAK_CHAIN_ID, novakAddresses } from "@/lib/addresses";
import { OP_LABEL, USDG_DECIMALS, fmtTime, fmtUsdg, useMarket, type EventNode } from "@/lib/novak";
import { shortHex } from "@/lib/utils";
import { GitBranch, Terminal } from "lucide-react";

function toTree(e: EventNode): CompositionNode {
  return {
    id: e.id,
    title: e.kind === "primitive" ? `${e.title} — ${e.source}` : "Composite",
    kind: e.kind,
    op: e.op !== undefined ? OP_LABEL[e.op] : undefined,
    windowSeconds: e.windowSeconds,
    eventStatus: e.status,
    compositeStatus: e.compositeStatus,
    children: e.children?.map(toTree),
  };
}

export function MarketDetail({ marketId }: { marketId: Hex }) {
  const { data: market, isLoading, error } = useMarket(marketId);
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  const { data: feeBps } = useReadContract({ address: novakAddresses.market, abi: marketAbi, functionName: "feeBps" });

  if (isLoading) return <p className="mx-auto max-w-6xl px-6 py-12 text-sm text-gray-500">Loading market from chain…</p>;
  if (error || !market || market.createdAt === 0n) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm text-gray-600">
          Market {shortHex(marketId)} not found on this chain. <Link href="/markets">Back to markets</Link>
        </p>
      </div>
    );
  }

  const pool = (v: bigint) => Number(v) / 10 ** USDG_DECIMALS;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="border-b border-gray-200 pb-6">
        <p className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">
          <MarketStatusLabel market={market} />
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-ink max-w-3xl">
          {market.question || market.event.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-xs text-gray-500">
          <span>
            Market <strong className="text-ink">{shortHex(market.marketId, 10, 8)}</strong>
          </span>
          <span>·</span>
          <span>
            Event <strong className="text-ink">{shortHex(market.eventId, 10, 8)}</strong>
          </span>
          <span>·</span>
          <span>
            {fmtUsdg(market.yesPool)} YES / {fmtUsdg(market.noPool)} NO USDG
          </span>
          {explorer && (
            <a className="underline" href={`${explorer}/address/${novakAddresses.market}`} target="_blank" rel="noreferrer">
              Market contract ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-10 min-w-0">
          <section>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> What this market settles on
            </h2>
            <p className="text-sm text-gray-600">
              {market.event.kind === "composite"
                ? "A composite Novak event — its identity is canonical, so any other protocol composing the same facts reads the same answer."
                : "A primitive Novak event, resolved by an independent resolver quorum."}{" "}
              Trading closed/closes at {fmtTime(market.tradingClosesAt)}, when observation opens.
            </p>
            <div className="mt-4 overflow-x-auto border border-gray-300 bg-paper p-5 rounded-sm">
              <CompositionTree node={toTree(market.event)} />
            </div>
          </section>

          <section>
            <SettlementSimulator yesPool={pool(market.yesPool)} noPool={pool(market.noPool)} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Terminal className="h-4 w-4" /> How this settles
            </h2>
            <div className="mt-3 border border-gray-300 bg-paper p-5 text-sm text-gray-700 leading-relaxed rounded-sm space-y-3">
              <p>
                Resolvers read the source (Chainlink feeds, stock-token ERC-8056 logs, Robinhood&apos;s asset registry) and
                submit the outcome plus an evidence hash. Once the quorum agrees and the dispute window passes, the event
                is final, and <code>Market.settle()</code> reads it through <code>Settlement → EventBus</code> — never from a
                resolver directly. A keeper calls it automatically; anyone else can too.
              </p>
              <p>
                Parimutuel: winners split the losing pool pro-rata to stake (minus a {feeBps !== undefined ? Number(feeBps) / 100 : "…"}% protocol fee) and get their
                own stake back. If nobody backed the winning side, everyone is refunded and no fee is taken.
              </p>
              <p>
                If the event is <strong>voided</strong> (a dispute that never converged, or nobody could observe it), the
                market switches to refunds: everyone reclaims exactly what they deposited.
              </p>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <MarketPositionCard market={market} />
        </aside>
      </div>
    </div>
  );
}
