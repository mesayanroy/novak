"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { EventStatus } from "@novak/sdk";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import type { MockMarket } from "@/lib/mock-data";
import { shortHex } from "@/lib/utils";
import { ArrowUpRight, TrendingUp, Layers } from "lucide-react";

export type MarketUnderlying =
  | { kind: "primitive"; status: EventStatus; tier?: 1 | 2 }
  | { kind: "composite"; status: "Unresolved" | "True" | "False" | "Voided" };

export function MarketCard({ market, underlying }: { market: MockMarket; underlying: MarketUnderlying }) {
  const yesPool = Number(market.yesPoolEth);
  const noPool = Number(market.noPoolEth);
  const total = yesPool + noPool;
  const yesPercent = total > 0 ? Math.round((yesPool / total) * 100) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
    >
      <Link
        href={`/markets/${market.id}`}
        className="group link-plain block border border-gray-300 bg-paper p-5 transition-all duration-200 hover:border-ink hover:shadow-md rounded-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[10px] uppercase font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                <Layers className="h-2.5 w-2.5" />
                {underlying.kind === "composite" ? "COMPOSITE EVENT" : "PRIMITIVE EVENT"}
              </span>
              <span className="font-mono text-[10px] text-gray-400">
                ID: {shortHex(market.id, 6, 4)}
              </span>
            </div>
            <h3 className="font-medium leading-snug text-base text-ink group-hover:underline flex items-center gap-1.5">
              {market.question}
              <ArrowUpRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 text-gray-500" />
            </h3>
          </div>

          {underlying.kind === "composite" ? (
            <CompositeStatusPill status={underlying.status} className="flex-none" />
          ) : (
            <EventStatusPill status={underlying.status} tier={underlying.tier} className="flex-none" />
          )}
        </div>

        {/* Parimutuel Ratio Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="flex items-center gap-1 text-ink font-semibold">
              <span>YES</span>
              <span className="text-gray-500 font-normal">({yesPercent}%)</span>
            </span>
            <span className="flex items-center gap-1 text-ink font-semibold">
              <span className="text-gray-500 font-normal">({noPercent}%)</span>
              <span>NO</span>
            </span>
          </div>

          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex border border-gray-200">
            <div
              className="h-full bg-ink transition-all duration-300"
              style={{ width: `${yesPercent}%` }}
              title={`YES Pool: ${yesPool} ETH`}
            />
            <div
              className="h-full bg-gray-300 transition-all duration-300"
              style={{ width: `${noPercent}%` }}
              title={`NO Pool: ${noPool} ETH`}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-xs">
          <div className="flex items-center gap-4 font-mono text-gray-600">
            <span>
              <strong className="text-ink">{market.yesPoolEth}</strong> ETH YES
            </span>
            <span>•</span>
            <span>
              <strong className="text-ink">{market.noPoolEth}</strong> ETH NO
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono text-xs font-semibold text-ink">
            <TrendingUp className="h-3.5 w-3.5 text-gray-500" />
            <span>{total.toFixed(2)} ETH POOLED</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
