import Link from "next/link";
import { EventStatus } from "@novak/sdk";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import type { MockMarket } from "@/lib/mock-data";
import { shortHex } from "@/lib/utils";

export type MarketUnderlying =
  | { kind: "primitive"; status: EventStatus; tier?: 1 | 2 }
  | { kind: "composite"; status: "Unresolved" | "True" | "False" | "Voided" };

export function MarketCard({ market, underlying }: { market: MockMarket; underlying: MarketUnderlying }) {
  const total = Number(market.yesPoolEth) + Number(market.noPoolEth);

  return (
    <Link
      href={`/markets/${market.id}`}
      className="link-plain block border border-gray-300 p-5 transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-medium leading-snug">{market.question}</p>
        {underlying.kind === "composite" ? (
          <CompositeStatusPill status={underlying.status} className="flex-none" />
        ) : (
          <EventStatusPill status={underlying.status} tier={underlying.tier} className="flex-none" />
        )}
      </div>

      <p className="mt-3 font-mono text-xs text-gray-500">
        Settles against <span className="text-gray-700">{shortHex(market.compositeId)}</span>
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
        <div className="flex gap-4">
          <span>
            <span className="text-gray-500">YES</span> {market.yesPoolEth} ETH
          </span>
          <span>
            <span className="text-gray-500">NO</span> {market.noPoolEth} ETH
          </span>
        </div>
        <span className="text-gray-500">{total.toFixed(2)} ETH pooled</span>
      </div>
    </Link>
  );
}
