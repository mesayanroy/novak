import { CodeBlock } from "@/components/CodeBlock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "SDK reference — Novak Docs" };

const implementedMethods = [
  { name: "createEvent(spec, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "getCreatedEventId(txHash)", kind: "read", returns: "Hex" },
  { name: "getEventStatus(eventId)", kind: "read", returns: "number" },
  { name: "isFinalized(eventId)", kind: "read", returns: "boolean" },
  { name: "finalize(eventId, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "createComposite(spec, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "tryResolveComposite(compositeId, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "getResolvedComposite(compositeId)", kind: "read", returns: "{ resolved, outcome }" },
  { name: "readOutcome(eventId)", kind: "read", returns: "Outcome" },
  { name: "isAvailable(eventId)", kind: "read", returns: "boolean" },
  { name: "resolveOutcome(eventId)", kind: "read", returns: "{ available, outcome }" },
  { name: "subscribe(topic, consumer, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "unsubscribe(topic, consumer, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "isSubscribed(topic, consumer)", kind: "read", returns: "boolean" },
  { name: "createMarket(eventId, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "getCreatedMarketId(txHash)", kind: "read", returns: "Hex" },
  { name: "depositCollateral(marketId, backingYes, amountWei, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "closePosition(marketId, backingYes, amount, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "settleMarket(marketId, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "claim(marketId, account)", kind: "write", returns: "Hex (tx hash)" },
  { name: "getMarket(marketId)", kind: "read", returns: "MarketDef" },
];

const comingSoonMethods = [
  { name: "dispute(eventId)", note: "Tier-1 escalation entry point on DisputeManager." },
  { name: "submitTier1Vote / submitTier2Vote", note: "Committee-member voting." },
  { name: "escalateTier2 / voidAfterTier2Timeout", note: "Tier escalation and the VOID floor." },
  { name: "escalateNonConvergence", note: "Ambiguous-quorum escalation." },
];

export default function SdkReferencePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">SDK reference</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">@novak/sdk</h1>

      <p className="mt-6 text-gray-700">
        A thin wrapper over the Novak contract surface. It deliberately mirrors the on-chain layering:
        reads of finalized event data go through <code className="font-mono text-sm">EventBus</code>{" "}
        only; resolver submission and the tiered dispute-escalation calls (
        <code className="font-mono text-sm">DisputeManager</code>) are intentionally not wrapped here —
        that&apos;s resolver/committee-member territory, not a consumer read/write path.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Install</h2>
      <CodeBlock className="mt-3" code="pnpm add @novak/sdk viem" />

      <h2 className="mt-10 text-xl font-semibold">Quickstart</h2>
      <Tabs defaultValue="read" className="mt-3">
        <TabsList>
          <TabsTrigger value="read">Read</TabsTrigger>
          <TabsTrigger value="write">Write</TabsTrigger>
        </TabsList>
        <TabsContent value="read">
          <CodeBlock
            variant="dark"
            code={`import { NovakClient } from "@novak/sdk";

const client = new NovakClient(publicClient, undefined, addresses);

// Read a finalized primitive event's outcome.
const outcome = await client.readOutcome(eventId);

// Read a composite event's resolved outcome (Unresolved/True/False don't
// throw — Voided also reports { resolved: false } through this API).
const { resolved, outcome: compositeOutcome } = await client.getResolvedComposite(compositeId);`}
          />
        </TabsContent>
        <TabsContent value="write">
          <CodeBlock
            variant="dark"
            code={`import { NovakClient } from "@novak/sdk";

const client = new NovakClient(publicClient, walletClient, addresses);

// Create a market referencing a finalized (possibly composite) event.
const txHash = await client.createMarket(compositeId, account);
const marketId = await client.getCreatedMarketId(txHash);

// Back YES with 0.1 ETH.
await client.depositCollateral(marketId, true, 100000000000000000n, account);`}
          />
        </TabsContent>
      </Tabs>

      <h2 className="mt-10 text-xl font-semibold">Method reference</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-ink">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Method</th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Kind</th>
              <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-600">Returns</th>
            </tr>
          </thead>
          <tbody>
            {implementedMethods.map((m) => (
              <tr key={m.name} className="border-b border-gray-200">
                <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                <td className="px-3 py-2">
                  <span className="border border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-600">
                    {m.kind}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-600">{m.returns}</td>
              </tr>
            ))}
            {comingSoonMethods.map((m) => (
              <tr key={m.name} className="border-b border-gray-200 text-gray-400">
                <td className="px-3 py-2 font-mono text-xs">{m.name}</td>
                <td className="px-3 py-2" colSpan={2}>
                  <span className="border border-dashed border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                    Coming soon
                  </span>{" "}
                  <span className="text-gray-500">— {m.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        The &ldquo;coming soon&rdquo; rows exist and work on-chain (
        <code className="font-mono text-xs">contracts/DisputeManager.sol</code>) — they&apos;re just not
        wrapped by <code className="font-mono text-xs">NovakClient</code> yet. A resolver/committee node
        calls them directly today, the same way{" "}
        <code className="font-mono text-xs">resolver/node/index.ts</code> calls{" "}
        <code className="font-mono text-xs">submitObservation</code>.
      </p>
    </article>
  );
}
