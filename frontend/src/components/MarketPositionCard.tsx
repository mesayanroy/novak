"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { marketAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";

/** Deposit collateral into a market, settle it once its event is finalized,
 *  and claim a payout — the parimutuel YES/NO flow described in
 *  derivatives/Market.sol. */
export function MarketPositionCard() {
  const [marketIdInput, setMarketIdInput] = useState("");
  const [amountEth, setAmountEth] = useState("0.1");
  const { writeContract, isPending, data: txHash } = useWriteContract();

  const marketId = marketIdInput.startsWith("0x") ? (marketIdInput as `0x${string}`) : undefined;

  const { data: marketDef } = useReadContract({
    address: novakAddresses.market,
    abi: marketAbi,
    functionName: "markets",
    args: marketId ? [marketId] : undefined,
    query: { enabled: Boolean(marketId) },
  });

  const settled = marketDef?.[2];
  const outcome = marketDef?.[3];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:col-span-2">
      <h2 className="mb-3 text-lg font-semibold">Position</h2>
      <input
        value={marketIdInput}
        onChange={(e) => setMarketIdInput(e.target.value)}
        placeholder="0x… market ID (from Create market's tx logs)"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      />

      {marketDef && (
        <p className="mb-3 text-xs text-slate-400">
          {settled ? `Settled — outcome: ${outcome ? "YES" : "NO"}` : "Not yet settled"}
        </p>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          value={amountEth}
          onChange={(e) => setAmountEth(e.target.value)}
          placeholder="ETH amount"
          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
        <button
          disabled={!marketId || isPending}
          onClick={() =>
            marketId &&
            writeContract({
              address: novakAddresses.market,
              abi: marketAbi,
              functionName: "depositCollateral",
              args: [marketId, true],
              value: parseEther(amountEth || "0"),
            })
          }
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          Back YES
        </button>
        <button
          disabled={!marketId || isPending}
          onClick={() =>
            marketId &&
            writeContract({
              address: novakAddresses.market,
              abi: marketAbi,
              functionName: "depositCollateral",
              args: [marketId, false],
              value: parseEther(amountEth || "0"),
            })
          }
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium hover:bg-rose-500 disabled:opacity-50"
        >
          Back NO
        </button>
      </div>

      <div className="flex gap-2">
        <button
          disabled={!marketId || isPending}
          onClick={() =>
            marketId &&
            writeContract({
              address: novakAddresses.market,
              abi: marketAbi,
              functionName: "settle",
              args: [marketId],
            })
          }
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          Settle
        </button>
        <button
          disabled={!marketId || isPending}
          onClick={() =>
            marketId &&
            writeContract({
              address: novakAddresses.market,
              abi: marketAbi,
              functionName: "claim",
              args: [marketId],
            })
          }
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          Claim payout
        </button>
      </div>

      {txHash && <p className="mt-3 break-all text-xs text-slate-500">tx: {txHash}</p>}
    </div>
  );
}
