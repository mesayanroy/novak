"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Availability, MarketStatus, TESTNET_FAUCET_URL, marketAbi, mockUsdgAbi } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "@/lib/addresses";
import { USDG_DECIMALS, fmtUsdg, useNovakClient, type LiveMarket } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { MarketStatusLabel } from "@/components/markets/MarketCard";
import { shortHex } from "@/lib/utils";

/**
 * USDG position flow on Market.sol: (mint test USDG) -> approve -> back YES/NO
 * -> [trading closes] -> settle (anyone; the keeper usually does it) -> claim.
 * Withdrawals are only possible while trading is open — that is what stops
 * the losing side from pulling out once the outcome is public.
 */
export function MarketPositionCard({ market }: { market: LiveMarket }) {
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const { run, pending, error, lastHash } = useTx();
  const [amount, setAmount] = useState("50");

  const id = market.marketId;
  const { data } = useReadContracts({
    allowFailure: false,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
    contracts: address
      ? [
          { address: novakAddresses.collateral, abi: mockUsdgAbi, functionName: "balanceOf", args: [address] },
          { address: novakAddresses.collateral, abi: mockUsdgAbi, functionName: "allowance", args: [address, novakAddresses.market] },
          { address: novakAddresses.market, abi: marketAbi, functionName: "yesBalance", args: [id, address] },
          { address: novakAddresses.market, abi: marketAbi, functionName: "noBalance", args: [id, address] },
          { address: novakAddresses.market, abi: marketAbi, functionName: "payoutOf", args: [id, address] },
          { address: novakAddresses.market, abi: marketAbi, functionName: "claimed", args: [id, address] },
        ]
      : [],
  });
  const [balance, allowance, yesStake, noStake, payout] = (data?.slice(0, 5) ?? []) as (bigint | undefined)[];
  const claimed = data?.[5] as boolean | undefined;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const tradingOpen = market.status === MarketStatus.Open && now < market.tradingClosesAt;
  const canSettle = market.status === MarketStatus.Open && market.event.availability !== Availability.Pending;
  let amountWei = 0n;
  try {
    amountWei = parseUnits(amount || "0", USDG_DECIMALS);
  } catch {
    /* invalid input */
  }
  const needsApproval = allowance !== undefined && allowance < amountWei;

  const act = (label: string, fn: () => Promise<`0x${string}`>) =>
    run(label, async (wait) => {
      await wait(await fn());
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your position</CardTitle>
        <CardDescription>
          <MarketStatusLabel market={market} />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isConnected || !client || !address ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-gray-300 p-4">
            <p className="text-sm text-gray-600">Connect a wallet (Robinhood Wallet, MetaMask, …) on Robinhood Chain testnet.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <Stat label="Wallet USDG" value={balance !== undefined ? fmtUsdg(balance) : "…"} />
              <Stat label="Your YES" value={yesStake !== undefined ? fmtUsdg(yesStake) : "…"} />
              <Stat label="Your NO" value={noStake !== undefined ? fmtUsdg(noStake) : "…"} />
            </div>

            {deployment?.chainId === 46630 && (
              <p className="text-xs text-gray-500">
                Gas is testnet ETH —{" "}
                <a className="underline" href={TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
                  Robinhood Chain faucet
                </a>
                .
              </p>
            )}
            {deployment?.collateralIsMock && (
              <Button
                variant="ghost"
                size="sm"
                disabled={Boolean(pending)}
                onClick={() => act("Minting", () => client.mintTestCollateral(address, parseUnits("1000", USDG_DECIMALS), address))}
              >
                Get 1,000 test USDG
              </Button>
            )}

            {tradingOpen && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" aria-label="Amount in USDG" />
                  <span className="font-mono text-xs text-gray-500">USDG</span>
                </div>
                {needsApproval ? (
                  <Button disabled={Boolean(pending) || amountWei === 0n} onClick={() => act("Approving", () => client.approveCollateral(amountWei, address))}>
                    Approve {amount} USDG
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button disabled={Boolean(pending) || amountWei === 0n} onClick={() => act("Backing YES", () => client.depositCollateral(id, true, amountWei, address))}>
                      Back YES
                    </Button>
                    <Button variant="secondary" disabled={Boolean(pending) || amountWei === 0n} onClick={() => act("Backing NO", () => client.depositCollateral(id, false, amountWei, address))}>
                      Back NO
                    </Button>
                  </div>
                )}
                {((yesStake ?? 0n) > 0n || (noStake ?? 0n) > 0n) && (
                  <div className="flex gap-2">
                    {(yesStake ?? 0n) > 0n && (
                      <Button variant="ghost" size="sm" disabled={Boolean(pending)} onClick={() => act("Withdrawing", () => client.closePosition(id, true, yesStake ?? 0n, address))}>
                        Withdraw YES
                      </Button>
                    )}
                    {(noStake ?? 0n) > 0n && (
                      <Button variant="ghost" size="sm" disabled={Boolean(pending)} onClick={() => act("Withdrawing", () => client.closePosition(id, false, noStake ?? 0n, address))}>
                        Withdraw NO
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {canSettle && (
              <Button variant="secondary" disabled={Boolean(pending)} onClick={() => act("Settling", () => client.settleMarket(id, address))}>
                Settle market (event is decided)
              </Button>
            )}

            {market.status !== MarketStatus.Open &&
              (claimed ? (
                <p className="text-sm text-gray-600">Claimed.</p>
              ) : (payout ?? 0n) > 0n ? (
                <Button disabled={Boolean(pending)} onClick={() => act("Claiming", () => client.claim(id, address))}>
                  Claim {fmtUsdg(payout ?? 0n)} USDG{market.status === MarketStatus.Refunding ? " refund" : ""}
                </Button>
              ) : (
                <p className="text-sm text-gray-600">Nothing to claim for this wallet.</p>
              ))}

            {pending && <p className="font-mono text-xs text-gray-500">{pending}…</p>}
            {error && <p className="font-mono text-xs text-rose-700">{error}</p>}
            {lastHash && !pending && <p className="font-mono text-xs text-gray-400">last tx {shortHex(lastHash, 10, 8)}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 p-2">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
