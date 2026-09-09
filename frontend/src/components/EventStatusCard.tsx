"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { eventBusAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Looks up whether a given event ID is finalized/available via the EventBus
 * — reads only through the Bus, never a resolver or the Registry directly.
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
    <Card>
      <CardHeader>
        <CardTitle>Event status</CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          value={eventIdInput}
          onChange={(e) => setEventIdInput(e.target.value)}
          placeholder="0x… event or composite ID"
        />
        {eventId && (
          <p className="mt-3 text-sm text-gray-600">
            {isFetching ? "Checking…" : available ? "Finalized & available" : "Not yet available"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
