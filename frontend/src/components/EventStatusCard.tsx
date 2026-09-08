"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { eventBusAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";

/**
 * Looks up whether a given event ID is finalized/available via the EventBus —
 * this component (like everything in the demo UI) only ever reads through the
 * Bus, never a resolver or the Registry directly.
 */
export function EventStatusCard() {
  const [eventIdInput, setEventIdInput] = useState("");
  const eventId = eventIdInput.startsWith("0x") ? (eventIdInput as `0x${string}`) : undefined;

  const { data: available, isFetching } = useReadContract({
    address: novakAddresses.eventBus,
    abi: eventBusAbi,
    functionName: "isAvailable",
    args: eventId ? [eventId] : undefined,
    query: { enabled: Boolean(eventId) },
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 text-lg font-semibold">Event status</h2>
      <input
        value={eventIdInput}
        onChange={(e) => setEventIdInput(e.target.value)}
        placeholder="0x… event or composite ID"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      />
      {eventId && (
        <p className="mt-3 text-sm text-slate-400">
          {isFetching ? "Checking…" : available ? "✅ Finalized & available" : "⏳ Not yet available"}
        </p>
      )}
    </div>
  );
}
