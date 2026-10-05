"use client";

import { CHAINLINK_FEED_CATALOG } from "@novak/sdk";
import { useLiveFeeds, fmtPrice } from "@/lib/feeds";

const GROUPS: Array<["Equity" | "Bond" | "Crypto", string]> = [
  ["Equity", "Tokenized stocks & ETFs"],
  ["Bond", "Tokenized Treasuries / bonds"],
  ["Crypto", "Crypto"],
];

/** Every Chainlink feed on Robinhood Chain, grouped, with its live price. */
export function FeedSelect({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
  const { data } = useLiveFeeds();
  const price = (addr: string) => data?.rows.find((r) => r.feed.toLowerCase() === addr.toLowerCase())?.price;
  return (
    <select className="h-10 max-w-[16rem] border border-gray-300 px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {GROUPS.map(([cls, label]) => (
        <optgroup key={cls} label={label}>
          {CHAINLINK_FEED_CATALOG.filter((f) => f.assetClass === cls).map((f) => {
            const p = price(f.address);
            return (
              <option key={f.address} value={f.symbol}>
                {f.symbol}
                {p !== undefined && p !== null ? ` — ${fmtPrice(p)}` : ""}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
