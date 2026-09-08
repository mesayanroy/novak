"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import { marketAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";

/** Opens a market against a (composite) event ID, via the Market contract. */
export function CreateMarketCard() {
  const [eventIdInput, setEventIdInput] = useState("");
  const { writeContract, isPending, data: txHash } = useWriteContract();

  const eventId = eventIdInput.startsWith("0x") ? (eventIdInput as `0x${string}`) : undefined;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 text-lg font-semibold">Create market</h2>
      <input
        value={eventIdInput}
        onChange={(e) => setEventIdInput(e.target.value)}
        placeholder="0x… composite event ID to settle against"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      />
      <button
        disabled={!eventId || isPending}
        onClick={() =>
          eventId &&
          writeContract({
            address: novakAddresses.market,
            abi: marketAbi,
            functionName: "createMarket",
            args: [eventId],
          })
        }
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Create market"}
      </button>
      {txHash && <p className="mt-3 break-all text-xs text-slate-500">tx: {txHash}</p>}
    </div>
  );
}
