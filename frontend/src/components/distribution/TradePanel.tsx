"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { DistributionStatus, distributionMarketAbi, mockUsdgAbi } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "@/lib/addresses";
import { USDG_DECIMALS, fmtUsdg, useNovakClient } from "@/lib/novak";
import type { DistributionView } from "@/lib/distribution";
import { useTx } from "@/lib/useTx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/ConnectButton";

/**
 * Buy or sell a price range. 1 share pays 1 USDG if its range wins, so a
 * share's price IS the market's probability for that range. Quotes come from
 * the contract's own LMSR math (quoteBuy / quoteSell).
 */
export function TradePanel({ view, bucket, onBucket }: { view: DistributionView; bucket: number; onBucket: (b: number) => void }) {
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const { run, pending, error } = useTx();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("25");
  const dist = novakAddresses.distributionMarket!;

  const { data } = useReadContracts({
    allowFailure: false,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
    contracts: address
      ? [
          { address: novakAddresses.collateral, abi: mockUsdgAbi, functionName: "balanceOf", args: [address] },
          { address: novakAddresses.collateral, abi: mockUsdgAbi, functionName: "allowance", args: [address, dist] },
          { address: dist, abi: distributionMarketAbi, functionName: "sharesOf", args: [view.marketId, address] },
          { address: dist, abi: distributionMarketAbi, functionName: "payoutOf", args: [view.marketId, address] },
          { address: dist, abi: distributionMarketAbi, functionName: "redeemed", args: [view.marketId, address] },
        ]
      : [],
  });
  const balance = data?.[0] as bigint | undefined;
  const allowance = data?.[1] as bigint | undefined;
  const shares = (data?.[2] as readonly bigint[] | undefined) ?? [];
  const payout = data?.[3] as bigint | undefined;
  const redeemed = data?.[4] as boolean | undefined;

  let units = 0n;
  try {
    units = parseUnits(amount || "0", USDG_DECIMALS);
  } catch {
    /* invalid input */
  }

  const quote = useQuery({
    queryKey: ["quote", view.marketId, bucket, side, units.toString(), view.prices.join(",")],
    enabled: Boolean(client) && units > 0n && view.status === DistributionStatus.Open,
    queryFn: async () =>
      side === "buy"
        ? { kind: "buy" as const, ...(await client!.distributionQuoteBuy(view.marketId, bucket, units)) }
        : { kind: "sell" as const, ...(await client!.distributionQuoteSell(view.marketId, bucket, units)) },
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const open = view.status === DistributionStatus.Open && now < view.tradingClosesAt;
  const act = (label: string, fn: () => Promise<`0x${string}`>) => run(label, async (wait) => wait(await fn()));
  const avgPrice =
    quote.data?.kind === "buy" && quote.data.shares > 0n
      ? Number(units - quote.data.fee) / Number(quote.data.shares)
      : quote.data?.kind === "sell" && units > 0n
        ? Number(quote.data.collateralOut + quote.data.fee) / Number(units)
        : undefined;

  if (!isConnected || !client || !address) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-5">
        <p className="font-semibold text-ink">Trade</p>
        <p className="mt-2 text-sm text-gray-600">Connect a wallet on Robinhood Chain testnet to trade ranges.</p>
        <div className="mt-3">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">Trade</p>
        <span className="font-mono text-xs text-gray-500">Wallet: {balance !== undefined ? fmtUsdg(balance) : "…"} USDG</span>
      </div>

      <label className="text-xs font-mono text-gray-600">
        Range
        <select className="mt-1 h-10 w-full border border-gray-300 px-2 text-sm" value={bucket} onChange={(e) => onBucket(Number(e.target.value))}>
          {view.labels.map((l, i) => (
            <option key={i} value={i}>
              {l} — {(view.prices[i] * 100).toFixed(1)}%
            </option>
          ))}
        </select>
      </label>

      {open ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={side === "buy" ? "primary" : "secondary"} onClick={() => setSide("buy")}>
              Buy
            </Button>
            <Button size="sm" variant={side === "sell" ? "primary" : "secondary"} onClick={() => setSide("sell")}>
              Sell
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={side === "buy" ? "USDG to spend" : "Shares to sell"} />
            <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{side === "buy" ? "USDG" : "shares"}</span>
            {side === "sell" && (shares[bucket] ?? 0n) > 0n && (
              <Button size="sm" variant="ghost" onClick={() => setAmount((Number(shares[bucket]) / 1e6).toString())}>
                Max
              </Button>
            )}
          </div>
          <div className="font-mono text-xs text-gray-600 space-y-0.5">
            {quote.isFetching && <p>Quoting…</p>}
            {quote.error && <p className="text-rose-700">Quote failed: {(quote.error as Error).message.split("\n")[0]}</p>}
            {quote.data?.kind === "buy" && (
              <>
                <p>You get ≈ {(Number(quote.data.shares) / 1e6).toFixed(2)} shares (pays {(Number(quote.data.shares) / 1e6).toFixed(2)} USDG if it wins)</p>
                <p>Avg price {avgPrice?.toFixed(3)} · fee {fmtUsdg(quote.data.fee)} USDG</p>
              </>
            )}
            {quote.data?.kind === "sell" && (
              <p>
                You receive ≈ {fmtUsdg(quote.data.collateralOut)} USDG · avg price {avgPrice?.toFixed(3)} · fee {fmtUsdg(quote.data.fee)}
              </p>
            )}
          </div>
          {deployment?.collateralIsMock && (balance ?? 0n) < units && side === "buy" && (
            <Button size="sm" variant="ghost" disabled={Boolean(pending)} onClick={() => act("Minting", () => client.mintTestCollateral(address, 1_000_000_000n, address))}>
              Get 1,000 test USDG
            </Button>
          )}
          {side === "buy" && allowance !== undefined && allowance < units ? (
            <Button disabled={Boolean(pending)} onClick={() => act("Approving", () => client.approveCollateralFor(dist, 2n ** 255n, address))}>
              Approve USDG for trading
            </Button>
          ) : side === "buy" ? (
            <Button
              disabled={Boolean(pending) || !quote.data || quote.data.kind !== "buy" || quote.data.shares === 0n}
              onClick={() =>
                quote.data?.kind === "buy" &&
                act("Buying", () => client.distributionBuy(view.marketId, bucket, units, (quote.data as { shares: bigint }).shares * 98n / 100n, address))
              }
            >
              Buy {view.labels[bucket]}
            </Button>
          ) : (
            <Button
              disabled={Boolean(pending) || !quote.data || quote.data.kind !== "sell" || (shares[bucket] ?? 0n) < units}
              onClick={() =>
                quote.data?.kind === "sell" &&
                act("Selling", () => client.distributionSell(view.marketId, bucket, units, (quote.data as { collateralOut: bigint }).collateralOut * 98n / 100n, address))
              }
            >
              Sell {view.labels[bucket]}
            </Button>
          )}
          <p className="text-[11px] text-gray-500">2% slippage protection. Trading closes {new Date(Number(view.tradingClosesAt) * 1000).toLocaleString()}.</p>
        </>
      ) : view.status === DistributionStatus.Open ? (
        <>
          <p className="text-sm text-gray-600">Trading is closed — resolvers are checking the Chainlink round at T, then the dispute window runs. The keeper settles it automatically.</p>
          <Button variant="secondary" disabled={Boolean(pending)} onClick={() => act("Settling", () => client.distributionSettle(view.marketId, address))}>
            Settle now (if all ranges are decided)
          </Button>
        </>
      ) : redeemed ? (
        <p className="text-sm text-gray-600">Redeemed.</p>
      ) : (payout ?? 0n) > 0n ? (
        <Button disabled={Boolean(pending)} onClick={() => act("Redeeming", () => client.distributionRedeem(view.marketId, address))}>
          Redeem {fmtUsdg(payout!)} USDG{view.status === DistributionStatus.Voided ? " (void: 1/N per share)" : ""}
        </Button>
      ) : (
        <p className="text-sm text-gray-600">Nothing to redeem for this wallet.</p>
      )}

      <div>
        <p className="font-mono text-[11px] uppercase text-gray-500">Your position</p>
        <table className="mt-1 w-full font-mono text-xs">
          <tbody>
            {view.labels.map((l, i) =>
              (shares[i] ?? 0n) > 0n ? (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">{l}</td>
                  <td className="py-1 text-right text-ink">{(Number(shares[i]) / 1e6).toFixed(2)} sh</td>
                  <td className="py-1 text-right text-gray-500">pays {(Number(shares[i]) / 1e6).toFixed(2)} if wins</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        {shares.every((s) => s === 0n) && <p className="text-xs text-gray-500">No shares yet.</p>}
      </div>

      {pending && <p className="font-mono text-xs text-gray-500">{pending}…</p>}
      {error && <p className="font-mono text-xs text-rose-700">{error}</p>}
    </div>
  );
}
