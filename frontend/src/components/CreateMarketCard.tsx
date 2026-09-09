"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import { marketAbi } from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { shortHex } from "@/lib/utils";

/** Opens a market against a (composite) event ID, via the Market contract.
 *  Dev/advanced utility — not on the main discovery path, since there is no
 *  on-chain market enumeration yet (see /markets). */
export function CreateMarketCard() {
  const [eventIdInput, setEventIdInput] = useState("");
  const { writeContract, isPending, data: txHash } = useWriteContract();

  const eventId = eventIdInput.startsWith("0x") ? (eventIdInput as `0x${string}`) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a market (advanced)</CardTitle>
        <CardDescription>
          Opens a real market on-chain against a finalized composite or primitive event ID. Requires a
          local Anvil deployment and a connected wallet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          value={eventIdInput}
          onChange={(e) => setEventIdInput(e.target.value)}
          placeholder="0x… composite event ID to settle against"
          className="mb-3"
        />
        <Button
          variant="secondary"
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
        >
          {isPending ? "Submitting…" : "Create market"}
        </Button>
        {txHash && <p className="mt-3 font-mono text-xs text-gray-500">tx: {shortHex(txHash, 10, 8)}</p>}
      </CardContent>
    </Card>
  );
}
