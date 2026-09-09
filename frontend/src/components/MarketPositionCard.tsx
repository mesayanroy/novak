"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { marketAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { shortHex } from "@/lib/utils";

/** Deposit collateral into a market, settle it once its event is finalized,
 *  and claim a payout — the parimutuel YES/NO flow in derivatives/Market.sol.
 *  Position-taking is gated behind wallet connection. */
export function MarketPositionCard({ marketId: presetMarketId }: { marketId?: `0x${string}` }) {
  const { isConnected } = useAccount();
  const [marketIdInput, setMarketIdInput] = useState(presetMarketId ?? "");
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
    <Card>
      <CardHeader>
        <CardTitle>Take a position</CardTitle>
        <CardDescription>Parimutuel YES/NO pool — reads/writes go through Market.sol only.</CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-gray-300 p-4">
            <p className="text-sm text-gray-600">Connect a wallet to take a position.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {!presetMarketId && (
              <Input
                value={marketIdInput}
                onChange={(e) => setMarketIdInput(e.target.value)}
                placeholder="0x… market ID"
                className="mb-3"
              />
            )}

            {marketDef && (
              <p className="mb-3 font-mono text-xs text-gray-500">
                {settled ? `Settled — outcome: ${outcome ? "YES" : "NO"}` : "Not yet settled"}
              </p>
            )}

            <div className="mb-3 flex items-center gap-2">
              <Input
                value={amountEth}
                onChange={(e) => setAmountEth(e.target.value)}
                placeholder="ETH amount"
                className="w-32"
              />
              <Button
                variant="secondary"
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
              >
                Back YES
              </Button>
              <Button
                variant="secondary"
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
              >
                Back NO
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={!marketId || isPending}
                onClick={() =>
                  marketId &&
                  writeContract({ address: novakAddresses.market, abi: marketAbi, functionName: "settle", args: [marketId] })
                }
              >
                Settle
              </Button>
              <Button
                variant="ghost"
                disabled={!marketId || isPending}
                onClick={() =>
                  marketId &&
                  writeContract({ address: novakAddresses.market, abi: marketAbi, functionName: "claim", args: [marketId] })
                }
              >
                Claim payout
              </Button>
            </div>

            {txHash && <p className="mt-3 font-mono text-xs text-gray-500">tx: {shortHex(txHash, 10, 8)}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
