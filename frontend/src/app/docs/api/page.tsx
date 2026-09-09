import { EndpointSection } from "@/components/docs/EndpointSection";

export const metadata = { title: "Events API reference — Novak Docs" };

export default function ApiReferencePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Events API reference</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Events &amp; composition</h1>

      <div className="mt-6 border border-dashed border-gray-400 p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-gray-600">On-chain reference, not a live REST API</p>
        <p className="mt-2 text-sm text-gray-700">
          No API server is deployed for Novak yet. Every endpoint below documents the intended surface
          against the real, already-implemented on-chain function signatures (
          <code className="font-mono text-xs">EventRegistry</code>,{" "}
          <code className="font-mono text-xs">EventComposer</code>,{" "}
          <code className="font-mono text-xs">EventBus</code>) so a future indexer/API layer has an
          exact contract to build against. Today, reads happen via the{" "}
          <a href="/docs/sdk" className="text-ink">
            SDK
          </a>{" "}
          or direct contract calls — the curl examples below are illustrative of the intended REST
          shape, not something you can call right now.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <EndpointSection
          method="GET"
          path="/events"
          summary="List primitive events, optionally filtered by status."
          params={[
            { name: "status", type: "EventStatus | string", description: "Open, ObservationsSubmitted, ProposedOutcome, Disputed, Finalized, Voided, Expired." },
            { name: "limit", type: "number", description: "Page size, default 25." },
            { name: "cursor", type: "string", description: "Opaque pagination cursor." },
          ]}
          responseJson={`{
  "events": [
    {
      "id": "0x1a2b...9f1a2b",
      "sourceId": "example.rate-decision",
      "status": "Finalized",
      "quorumThreshold": 2,
      "observationDeadline": 1798761600
    }
  ],
  "nextCursor": null
}`}
          curl={`curl "https://api.novak.xyz/events?status=Finalized&limit=25"`}
          typescript={`// Today: read a specific known event ID via the SDK instead —
// there is no on-chain enumeration of "all events" to page through.
const status = await client.getEventStatus(eventId);`}
        />

        <EndpointSection
          method="GET"
          path="/events/:id"
          summary="Single primitive event: its spec and, once finalized, its outcome."
          params={[{ name: "id", type: "bytes32 (hex)", required: true, description: "Event ID." }]}
          responseJson={`{
  "id": "0x1a2b...9f1a2b",
  "spec": {
    "specVersion": 1,
    "sourceId": "example.rate-decision",
    "openTimestamp": 1798000000,
    "observationDeadline": 1798086400,
    "disputeWindowSeconds": 3600,
    "quorumThreshold": 2
  },
  "status": "Finalized",
  "outcome": {
    "exists": true,
    "outcomeData": "0x...(abi.encode(bool))",
    "finalizedAt": 1798090001
  }
}`}
          curl={`curl "https://api.novak.xyz/events/0x1a2b...9f1a2b"`}
          typescript={`const spec = await client.publicClient.readContract({
  address: addresses.eventRegistry,
  abi: eventRegistryAbi,
  functionName: "getEventSpec",
  args: [eventId],
});
const outcome = await client.readOutcome(eventId); // via EventBus`}
        />

        <EndpointSection
          method="GET"
          path="/events/:id/status"
          summary="Lightweight status poll — just the enum, for tight polling loops."
          params={[{ name: "id", type: "bytes32 (hex)", required: true, description: "Event or composite ID." }]}
          responseJson={`{ "status": "ObservationsSubmitted" }`}
          curl={`curl "https://api.novak.xyz/events/0x1a2b...9f1a2b/status"`}
          typescript={`const status = await client.getEventStatus(eventId); // number, see EventStatus enum`}
        />

        <EndpointSection
          method="POST"
          path="/events"
          summary="Create a new primitive event — permissionless (anyone may create an event; only authorized resolvers can later observe it)."
          params={[
            { name: "sourceId", type: "string", required: true, description: "Which resolver adapter class can serve this event." },
            { name: "specVersion", type: "number", required: true, description: "Outcome payload schema version (1 = abi.encode(bool))." },
            { name: "observationDeadline", type: "unix timestamp", required: true, description: "Last time a resolver may submit an observation." },
            { name: "disputeWindowSeconds", type: "number", required: true, description: "Challenge window after a proposed outcome." },
            { name: "quorumThreshold", type: "number", required: true, description: "Matching authorized-resolver observations required." },
            { name: "spec", type: "hex", required: true, description: "Opaque, versioned event definition." },
          ]}
          responseJson={`{ "id": "0x1a2b...9f1a2b", "txHash": "0xabc...123" }`}
          curl={`curl -X POST "https://api.novak.xyz/events" \\
  -H "Content-Type: application/json" \\
  -d '{"sourceId":"example.rate-decision","specVersion":1,"observationDeadline":1798086400,"disputeWindowSeconds":3600,"quorumThreshold":2,"spec":"0x..."}'`}
          typescript={`const txHash = await client.createEvent(eventSpec, account);
const eventId = await client.getCreatedEventId(txHash);`}
        />

        <EndpointSection
          method="GET"
          path="/composite-events/:id"
          summary="Composite event detail, including its full child event tree."
          params={[{ name: "id", type: "bytes32 (hex)", required: true, description: "Composite event ID." }]}
          responseJson={`{
  "id": "0x4d5e...3c4d5e",
  "op": "Within",
  "window": 172800,
  "status": "True",
  "depth": 1,
  "operands": [
    { "id": "0x1a2b...9f1a2b", "kind": "primitive", "status": "Finalized" },
    { "id": "0x2b3c...b3c4d", "kind": "primitive", "status": "Finalized" }
  ]
}`}
          curl={`curl "https://api.novak.xyz/composite-events/0x4d5e...3c4d5e"`}
          typescript={`const spec = await client.publicClient.readContract({
  address: addresses.eventComposer,
  abi: eventComposerAbi,
  functionName: "getCompositeSpec",
  args: [compositeId],
});
const { resolved, outcome } = await client.getResolvedComposite(compositeId);`}
        />

        <EndpointSection
          method="POST"
          path="/compose"
          summary="Build a new composite event from existing primitive or composite IDs."
          params={[
            { name: "op", type: "\"And\"|\"Or\"|\"Not\"|\"Before\"|\"Within\"", required: true, description: "Operator." },
            { name: "operands", type: "bytes32[]", required: true, description: "Existing event/composite IDs. Must already exist." },
            { name: "window", type: "number (seconds)", description: "Only meaningful for Before/Within." },
          ]}
          responseJson={`{ "id": "0x4d5e...3c4d5e", "txHash": "0xdef...456" }`}
          curl={`curl -X POST "https://api.novak.xyz/compose" \\
  -H "Content-Type: application/json" \\
  -d '{"op":"Within","operands":["0x1a2b...9f1a2b","0x2b3c...b3c4d"],"window":172800}'`}
          typescript={`const txHash = await client.createComposite(
  { op: CompositeOp.Within, operands: [eventA, eventB], window: 172800n },
  account,
);`}
        />

        <EndpointSection
          method="POST"
          path="/observations"
          permissioned="Resolver-only — not a general dev endpoint"
          summary="A resolver submits an observation (outcome + evidence hash) for an event it watches. Requires the caller to be an authorized resolver (EventRegistry.setResolverAuthorization)."
          params={[
            { name: "eventId", type: "bytes32 (hex)", required: true, description: "Event being observed." },
            { name: "outcomeData", type: "hex", required: true, description: "abi.encode(bool) for specVersion 1." },
            { name: "evidenceHash", type: "bytes32 (hex)", required: true, description: "Commitment to the resolver's raw evidence." },
          ]}
          responseJson={`{ "accepted": true, "quorumReached": false }`}
          curl={`# Resolver-signed request — never a general developer credential.
curl -X POST "https://api.novak.xyz/observations" \\
  -H "Authorization: Bearer <resolver-signing-key>" \\
  -d '{"eventId":"0x1a2b...9f1a2b","outcomeData":"0x...","evidenceHash":"0x..."}'`}
          typescript={`// Deliberately NOT wrapped by @novak/sdk's NovakClient — resolver-only.
// See resolver/node/index.ts for the real submission path.
await walletClient.writeContract({
  address: addresses.eventRegistry,
  abi: eventRegistryAbi,
  functionName: "submitObservation",
  args: [eventId, outcomeData, evidenceHash],
});`}
        />
      </div>
    </article>
  );
}
