"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowDown, Code2, ShieldCheck, Cpu, Database, AppWindow } from "lucide-react";

export interface LayerSpec {
  n: number;
  name: string;
  contract: string;
  job: string;
  detail: string;
  interfaces: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const layers: LayerSpec[] = [
  {
    n: 1,
    name: "Source",
    contract: "External Data Feeds",
    job: "Raw material: price feeds, Fed announcements, sports results, on-chain state.",
    detail: "Novak never touches this directly — it's what resolver adapters watch (resolver/adapters/). Data is signed or verified off-chain prior to on-chain observation.",
    interfaces: ["Chainlink", "Pyth", "REST Webhooks", "Uniswap V3 TWAP"],
    icon: Database,
  },
  {
    n: 2,
    name: "Resolver & Evidence",
    contract: "EventRegistry.sol",
    job: "Independent resolvers watch a source and submit an observation, not a bare outcome.",
    detail: "N-of-M matching, authorized-resolver submissions turn into one proposed outcome via EventRegistry.submitObservation(). Keeps immutable proof of observation.",
    interfaces: ["submitObservation()", "getProposedOutcome()", "IEventRegistry"],
    icon: Cpu,
  },
  {
    n: 3,
    name: "Dispute & Finalization",
    contract: "DisputeManager.sol",
    job: "A proposed outcome sits in a bonded challenge window before it's trusted.",
    detail: "Unchallenged outcomes auto-finalize after challenge window. Challenged (or ambiguous) outcomes trigger a bonded two-tier committee ladder — never a token vote.",
    interfaces: ["openDispute()", "voteTier1()", "escalateToTier2()", "finalizeOutcome()"],
    icon: ShieldCheck,
  },
  {
    n: 4,
    name: "Event Bus & Composition",
    contract: "EventBus.sol & EventComposer.sol",
    job: "Finalized events become standing, reusable, composable objects.",
    detail: "EventBus serves pull-based reads; EventComposer builds new deterministic events (AND, OR, NOT, BEFORE, WITHIN) from existing finalized events using canonical composite hashes.",
    interfaces: ["getEvent()", "getCompositeOutcome()", "registerComposite()", "WITHIN(Δt)"],
    icon: Code2,
  },
  {
    n: 5,
    name: "Application",
    contract: "Market.sol & Consumer Contracts",
    job: "Consumers read exclusively from the Event Bus, never a resolver.",
    detail: "Derivatives markets settle against finalized composite event outcomes (derivatives/Market.sol). Future applications like insurance protocols read from the exact same EventBus.",
    interfaces: ["settle()", "claimPayout()", "IEventBusConsumer"],
    icon: AppWindow,
  },
];

export function LayerDiagram({ detailed = false, className }: { detailed?: boolean; className?: string }) {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);

  return (
    <div className={cn("relative flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-gray-500 uppercase tracking-wider font-semibold">
          Layer Dependency Stack (Bottom → Top)
        </span>
        <span className="font-mono text-[11px] text-gray-400">
          Click any layer to inspect interface details
        </span>
      </div>

      {layers.map((layer, i) => {
        const isSelected = selectedLayer === layer.n;
        const LayerIcon = layer.icon;

        return (
          <div key={layer.n} className="flex flex-col">
            <motion.div
              whileHover={{ scale: 1.005 }}
              onClick={() => setSelectedLayer(isSelected ? null : layer.n)}
              className={cn(
                "group cursor-pointer border bg-paper p-4 transition-all duration-150 rounded-sm",
                isSelected
                  ? "border-ink shadow-md bg-gray-50/80 ring-1 ring-ink"
                  : "border-gray-300 hover:border-ink hover:bg-gray-50/50"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "flex h-9 w-9 flex-none items-center justify-center border font-mono text-sm font-semibold transition-colors",
                    isSelected ? "border-ink bg-ink text-paper" : "border-ink bg-transparent text-ink group-hover:bg-ink group-hover:text-paper"
                  )}>
                    0{layer.n}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-base text-ink flex items-center gap-2">
                        {layer.name}
                      </h4>
                      <span className="font-mono text-xs border border-gray-300 px-1.5 py-0.5 rounded text-gray-600 bg-paper">
                        {layer.contract}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 leading-relaxed">{layer.job}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-gray-400 group-hover:text-ink">
                  <LayerIcon className="h-4 w-4" />
                </div>
              </div>

              {(detailed || isSelected) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 flex flex-col gap-2"
                >
                  <p className="leading-relaxed text-gray-700">{layer.detail}</p>

                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="font-mono text-[10px] text-gray-400 uppercase font-semibold">
                      Interfaces &amp; Methods:
                    </span>
                    {layer.interfaces.map((iface) => (
                      <span
                        key={iface}
                        className="font-mono text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-ink"
                      >
                        {iface}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>

            {i < layers.length - 1 && (
              <div className="flex justify-center py-1 text-gray-400">
                <ArrowDown className="h-4 w-4 animate-pulse-subtle" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
