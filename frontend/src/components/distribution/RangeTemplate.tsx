"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CHAINLINK_FEEDS_MAINNET, buildPriceLadderSpecs, ladderBucketLabels, type Hex } from "@novak/sdk";
import { deployment, novakAddresses } from "@/lib/addresses";
import { useNovakClient } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedRow } from "@/app/api/feeds/route";

const TICKERS = Object.keys(CHAINLINK_FEEDS_MAINNET).filter((t) => !t.includes("/"));

const toLocalInput = (unix: number) => {
  const d = new Date(unix * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * "Where will TICKER be at T?" — builds a ladder of N-1 Chainlink price-at
 * events centred on the live price (one createEvents tx), then opens an LMSR
 * DistributionMarket over them, seeded with the b·ln(N) subsidy.
 */
export function RangeTemplate() {
  const router = useRouter();
  const { address } = useAccount();
  const client = useNovakClient();
  const { run, pending, error } = useTx();
  const [ticker, setTicker] = useState("NVDA");
  const [ranges, setRanges] = useState(6);
  const [stepPct, setStepPct] = useState("1");
  const [liquidity, setLiquidity] = useState("200");
  const [at, setAt] = useState(toLocalInput(Math.floor(Date.now() / 1000) + 3600));

  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => (await (await fetch("/api/feeds")).json()) as { rows: FeedRow[] },
  });
  const feed = CHAINLINK_FEEDS_MAINNET[ticker] as Hex;
  const spot = feeds.data?.rows.find((r) => r.feed.toLowerCase() === feed.toLowerCase())?.price;

  // Thresholds in feed units (8 decimals), centred on spot, rounded to the step.
  const thresholds = (() => {
    if (!spot) return [] as bigint[];
    const step = Math.max(spot * (Number(stepPct) / 100), 0.01);
    const centre = Math.round(spot / step) * step;
    const nb = ranges - 1;
    return Array.from({ length: nb }, (_, i) => BigInt(Math.round((centre + (i - Math.floor(nb / 2)) * step) * 1e8)));
  })();
  const labels = thresholds.length ? ladderBucketLabels(thresholds) : [];
  const b = BigInt(Math.round(Number(liquidity) * 1e6));
  const subsidy = client ? client.distributionSubsidy(b, ranges) : 0n;

  const create = () =>
    run("Creating ladder + market", async (wait) => {
      if (!client || !address || !deployment?.distributionMarket) throw new Error("Not connected");
      const T = BigInt(Math.floor(new Date(at).getTime() / 1000));
      if (T <= BigInt(Math.floor(Date.now() / 1000)) + 300n) throw new Error("Pick a time at least 5 minutes from now");
      const specs = buildPriceLadderSpecs({ feed, thresholds, at: T, maxStaleness: 3n * 86_400n, disputeWindowSeconds: 600n });
      const evTx = await client.createEvents(specs, address);
      await wait(evTx);
      const ids = await client.getCreatedEventIds(evTx);
      const allowance = await client.collateralAllowanceFor(address, novakAddresses.distributionMarket!);
      if (allowance < subsidy) await wait(await client.approveCollateralFor(novakAddresses.distributionMarket!, 2n ** 255n, address));
      const q = `Where will ${ticker} be at ${new Date(Number(T) * 1000).toLocaleString()}? (${labels.join(" | ")})`.slice(0, 280);
      const mTx = await client.createDistributionMarket(q, ids, T, b, address);
      await wait(mTx);
      router.push(`/markets/dist/${await client.getCreatedDistributionMarketId(mTx)}`);
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600">
        Traders buy and sell price <strong>ranges</strong>; the prices form the market&apos;s probability distribution. Each
        range boundary is a Novak event resolved from Chainlink&apos;s <strong>Robinhood {ticker} / USD</strong> round at the
        chosen time — including <strong>SGOV</strong>, a tokenized 0–3 month Treasury ETF.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="h-10 border border-gray-300 px-2" value={ticker} onChange={(e) => setTicker(e.target.value)}>
          {TICKERS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span>at</span>
        <Input type="datetime-local" className="w-56" value={at} onChange={(e) => setAt(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Ranges</span>
        <select className="h-10 border border-gray-300 px-2" value={ranges} onChange={(e) => setRanges(Number(e.target.value))}>
          {[4, 5, 6, 8, 10].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span>width</span>
        <Input className="w-20" value={stepPct} onChange={(e) => setStepPct(e.target.value)} />
        <span>% of price · liquidity b</span>
        <Input className="w-24" value={liquidity} onChange={(e) => setLiquidity(e.target.value)} />
        <span>USDG</span>
      </div>
      <p className="font-mono text-xs text-gray-600">
        Spot {spot ? `$${spot.toLocaleString()}` : "…"} → {labels.join(" · ") || "…"}
      </p>
      <p className="font-mono text-xs text-gray-500">
        You seed the market maker with ≈ {(Number(subsidy) / 1e6).toFixed(2)} USDG (b·ln N, its maximum loss); leftover returns
        to you at settlement. 3 transactions: ladder, approve, market.
      </p>
      <Button disabled={Boolean(pending) || thresholds.length === 0} onClick={create}>
        Create range market
      </Button>
      {pending && <p className="font-mono text-xs text-gray-500">{pending}…</p>}
      {error && <p className="font-mono text-xs text-rose-700">{error}</p>}
    </div>
  );
}
