"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MarketStatus } from "@novak/sdk";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import { ExampleDataBadge } from "@/components/ExampleDataBadge";
import { fmtTime, fmtUsdg, type LiveMarket } from "@/lib/novak";
import { shortHex } from "@/lib/utils";
import { ArrowUpRight, Clock, Layers } from "lucide-react";

export function MarketStatusLabel({ market }: { market: LiveMarket }) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (market.status === MarketStatus.Settled) return <>Settled · {market.outcome ? "YES" : "NO"} won</>;
  if (market.status === MarketStatus.Refunding) return <>Event voided · refunds open</>;
  if (now < market.tradingClosesAt) return <>Trading closes {fmtTime(market.tradingClosesAt)}</>;
  return <>Trading closed · awaiting resolution</>;
}

/** Card for a LIVE on-chain market (Market.sol via the SDK). */
export function MarketCard({ market }: { market: LiveMarket }) {
  const total = market.yesPool + market.noPool;
  const yesPercent = total > 0n ? Number((market.yesPool * 100n) / total) : 50;
  const noPercent = 100 - yesPercent;
  const e = market.event;

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Link
        href={`/markets/${market.marketId}`}
        className="group link-plain block border border-gray-300 bg-paper p-5 transition-all duration-200 hover:border-ink hover:shadow-md rounded-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono text-[10px] uppercase font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                <Layers className="h-2.5 w-2.5" />
                {e.kind === "composite" ? "Composite event" : "Primitive event"}
              </span>
              <span className="font-mono text-[10px] text-gray-400">{shortHex(market.marketId, 6, 4)}</span>
              {market.isExample && <ExampleDataBadge />}
            </div>
            <h3 className="font-medium leading-snug text-base text-ink group-hover:underline flex items-center gap-1.5">
              {market.question || e.title}
              <ArrowUpRight className="h-4 w-4 flex-none opacity-0 transition-opacity group-hover:opacity-100 text-gray-500" />
            </h3>
            <p className="mt-1 text-xs text-gray-500 truncate">Settles on: {e.title}</p>
          </div>

          {e.kind === "composite" ? (
            <CompositeStatusPill status={e.compositeStatus ?? "Unresolved"} className="flex-none" />
          ) : (
            e.status !== undefined && <EventStatusPill status={e.status} className="flex-none" />
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-ink font-semibold">
              YES <span className="text-gray-500 font-normal">({yesPercent}%)</span>
            </span>
            <span className="text-ink font-semibold">
              <span className="text-gray-500 font-normal">({noPercent}%)</span> NO
            </span>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex border border-gray-200">
            <div className="h-full bg-ink" style={{ width: `${yesPercent}%` }} />
            <div className="h-full bg-gray-300" style={{ width: `${noPercent}%` }} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-xs font-mono text-gray-600">
          <span>
            <strong className="text-ink">{fmtUsdg(total)}</strong> USDG pooled
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <MarketStatusLabel market={market} />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
