"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { mockUsdgAbi } from "@novakoracle/sdk";
import { deployment, NOVAK_CHAIN_ID, novakAddresses } from "./addresses";
import { findMetaMaskProvider } from "./wagmi";
import { usePortfolio } from "./portfolio";

/** Enough testnet ETH for a few trades and one dispute bond on this deployment. */
export const MIN_GAS_WEI = 300_000_000_000_000n; // 0.0003 ETH

export type StepId = "wallet" | "connect" | "network" | "gas" | "usdg" | "trade";

export interface SetupState {
  steps: Record<StepId, boolean>;
  done: number;
  total: number;
  complete: boolean;
  /** First unfinished step — what the UI should push next. */
  next?: StepId;
  ethBalance?: bigint;
  usdgBalance?: bigint;
  ready: boolean;
  /** All six steps were completed at some point by this wallet (remembered), so
   *  onboarding UI ("Get started", the checklist) is gone for good. */
  finished: boolean;
}

const ORDER: StepId[] = ["wallet", "connect", "network", "gas", "usdg", "trade"];

export function useSetupProgress(): SetupState {
  const { address, isConnected, chainId } = useAccount();
  const [hasMetaMask, setHasMetaMask] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    // Extensions inject after load; re-check briefly so the step flips without a reload.
    const check = () => setHasMetaMask(Boolean(findMetaMaskProvider()));
    check();
    const t = setInterval(check, 1500);
    return () => clearInterval(t);
  }, []);

  const onChain = isConnected && chainId === NOVAK_CHAIN_ID;
  const { data: eth } = useBalance({ address, chainId: NOVAK_CHAIN_ID, query: { enabled: Boolean(address), refetchInterval: 10_000 } });
  const { data: usdg } = useReadContract({
    address: novakAddresses.collateral,
    abi: mockUsdgAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: NOVAK_CHAIN_ID,
    query: { enabled: Boolean(address && deployment), refetchInterval: 10_000 },
  });
  const { data: portfolio } = usePortfolio(address);

  const steps: Record<StepId, boolean> = {
    wallet: Boolean(hasMetaMask) || isConnected,
    connect: isConnected,
    network: onChain,
    gas: (eth?.value ?? 0n) >= MIN_GAS_WEI,
    usdg: ((usdg as bigint | undefined) ?? 0n) > 0n || Boolean(portfolio?.positions.length),
    trade: Boolean(portfolio?.positions.length),
  };
  const done = ORDER.filter((s) => steps[s]).length;
  const complete = done === ORDER.length;
  const key = address ? `novak.setup.finished.${address.toLowerCase()}` : undefined;
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    if (!key) return setRemembered(false);
    try {
      if (complete) localStorage.setItem(key, "1");
      setRemembered(localStorage.getItem(key) === "1");
    } catch {
      setRemembered(complete);
    }
  }, [key, complete]);
  return {
    steps,
    done,
    total: ORDER.length,
    complete,
    finished: complete || remembered,
    next: ORDER.find((s) => !steps[s]),
    ethBalance: eth?.value,
    usdgBalance: usdg as bigint | undefined,
    ready: hasMetaMask !== undefined,
  };
}
