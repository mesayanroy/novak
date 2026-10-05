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
    contract: "Robinhood Chain mainnet + public APIs (read-only)",
    job: "Raw facts: Chainlink stock & SGOV feeds, ERC-8056 stock-token multipliers, Robinhood's asset API, the Fed's target rate.",
    detail: "Novak never writes here. Resolver adapters read it (resolver/adapters/): chainlink.price-at.v1, rh.corporate-action.v1, rh.trading-status.v1, macro.fomc.v1. Mainnet is not an archive node, so adapters read logs and round history rather than historical eth_call.",
    interfaces: ["Chainlink AggregatorV3", "UIMultiplierUpdated logs", "api.robinhood.com/rhj/assets", "FRED DFEDTARU"],
    icon: Database,
  },
  {
    n: 2,
    name: "Resolvers & quorum",
    contract: "EventRegistry.sol",
    job: "Authorized resolvers submit what they observed plus an evidence hash; N-of-M identical answers propose the outcome.",
    detail: "Observations are rejected before openTimestamp and after observationDeadline. v2 payloads carry occurredAt. Each resolver's boolean is recorded so the TreasuryVault can pay the ones who were right. Nobody observed it → Expired.",
    interfaces: ["createEvents()", "submitObservation()", "finalize()", "expire()", "observedOutcome()"],
    icon: Cpu,
  },
  {
    n: 3,
    name: "Disputes & finalization",
    contract: "DisputeManager.sol",
    job: "A proposed outcome waits out its dispute window; a bonded challenge hands it to resolver committees.",
    detail: "Tier 1: up to 7 resolvers, 1 hour, 66% of the committee decides. No decision → Tier 2: up to 15, 2 hours. Still none → Voided, bonds refunded. Never a token vote. Payouts are pull-based (withdraw()).",
    interfaces: ["dispute()", "submitTier1Vote()", "escalateTier2()", "submitTier2Vote()", "voidAfterTier2Timeout()"],
    icon: ShieldCheck,
  },
  {
    n: 4,
    name: "Event Bus & composition",
    contract: "EventBus.sol & EventComposer.sol",
    job: "Finalized events become standing facts that can be read and combined.",
    detail: "EventComposer builds AND / OR / NOT / BEFORE / WITHIN composites with canonical IDs and bounded depth; a voided operand propagates. EventBus serves primitives and composites through one read API with Pending / Available / Voided.",
    interfaces: ["readOutcome()", "getAvailability()", "createComposite()", "tryResolve()"],
    icon: Code2,
  },
  {
    n: 5,
    name: "Applications",
    contract: "DistributionMarket · Market · StockLendingGuard · your contract",
    job: "Consumers read only the Event Bus (via Settlement) and push fees to the TreasuryVault.",
    detail: "Range markets (LMSR) settle on a ladder of threshold events; yes/no markets settle on one event; the lending guard pauses liquidations. Each has a regression test proving it holds no Registry, Composer or resolver reference.",
    interfaces: ["Settlement.getSettlements()", "settle()", "redeem() / claim()", "canLiquidate()"],
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
