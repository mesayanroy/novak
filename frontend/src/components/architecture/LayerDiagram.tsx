import { cn } from "@/lib/utils";

const layers = [
  {
    n: 1,
    name: "Source",
    job: "Raw material: price feeds, Fed announcements, sports results, on-chain state.",
    detail:
      "Novak never touches this directly — it's what resolver adapters watch (resolver/adapters/).",
  },
  {
    n: 2,
    name: "Resolver & evidence",
    job: "Independent resolvers watch a source and submit an observation, not a bare outcome.",
    detail:
      "N-of-M matching, authorized-resolver submissions turn into one proposed outcome (EventRegistry.submitObservation).",
  },
  {
    n: 3,
    name: "Dispute & finalization",
    job: "A proposed outcome sits in a bonded challenge window before it's trusted.",
    detail:
      "Unchallenged → auto-finalizes. Challenged (or ambiguous) → a bonded two-tier committee ladder decides — never a token vote (DisputeManager.sol).",
  },
  {
    n: 4,
    name: "Event Bus & Composition",
    job: "Finalized events become standing, reusable, composable objects.",
    detail:
      "EventBus serves pull-based reads; EventComposer builds new deterministic events (AND/OR/NOT/BEFORE/WITHIN) from existing ones.",
  },
  {
    n: 5,
    name: "Application",
    job: "Consumers read exclusively from the Event Bus, never a resolver.",
    detail: "Derivatives markets today (derivatives/Market.sol); insurance or prediction markets tomorrow.",
  },
];

export function LayerDiagram({ detailed = false, className }: { detailed?: boolean; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {layers.map((layer, i) => (
        <div key={layer.n}>
          <div className="flex gap-4 border border-gray-300 bg-paper p-4 sm:gap-6 sm:p-5">
            <div className="flex h-8 w-8 flex-none items-center justify-center border border-ink font-mono text-sm">
              {layer.n}
            </div>
            <div>
              <p className="font-semibold">{layer.name}</p>
              <p className="mt-1 text-sm text-gray-700">{layer.job}</p>
              {detailed && <p className="mt-2 text-sm text-gray-500">{layer.detail}</p>}
            </div>
          </div>
          {i < layers.length - 1 && (
            <div className="flex justify-start pl-[35px] sm:pl-[43px]">
              <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                <path d="M8 0v18" stroke="#A19D97" strokeWidth="1.4" />
                <path d="M2.5 15.5 8 21l5.5-5.5" stroke="#A19D97" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
