"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, type Hex } from "viem";
import { usePublicClient } from "wagmi";

/**
 * Runs one or more sequential writes (e.g. approve -> deposit, createEvent ->
 * createMarket), waiting for each receipt, then refreshes every Novak query.
 * Exposes a short human-readable error instead of viem's full dump.
 */
export function useTx() {
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<Hex | null>(null);

  async function run<T>(label: string, fn: (wait: (hash: Hex) => Promise<void>) => Promise<T>): Promise<T | undefined> {
    setPending(label);
    setError(null);
    try {
      const result = await fn(async (hash) => {
        setLastHash(hash);
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
      });
      await queryClient.invalidateQueries({ queryKey: ["novak"] });
      return result;
    } catch (err) {
      setError(err instanceof BaseError ? err.shortMessage : (err as Error).message);
      return undefined;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, error, lastHash };
}
