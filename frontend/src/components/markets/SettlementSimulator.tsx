"use client";

import { useState } from "react";
import { Check, Play, RefreshCw, Calculator, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettlementSimulator({ yesPool, noPool }: { yesPool: number; noPool: number }) {
  const [operand1Outcome, setOperand1Outcome] = useState<boolean>(true);
  const [operand2Outcome, setOperand2Outcome] = useState<boolean>(true);
  const [withinWindow, setWithinWindow] = useState<boolean>(true);

  // Evaluate composite WITHIN operator outcome
  const simulatedOutcome = operand1Outcome && operand2Outcome && withinWindow;

  // Parimutuel Payout calculation simulation
  const totalPool = yesPool + noPool;

  return (
    <div className="border border-gray-300 bg-gray-50/80 p-5 rounded-sm">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-ink" />
          <h3 className="font-semibold text-sm text-ink font-mono uppercase tracking-wide">
            Settlement &amp; Payout Simulator
          </h3>
        </div>
        <span className="font-mono text-[10px] bg-paper border border-gray-300 px-2 py-0.5 rounded text-gray-600">
          PARIMUTUEL ENGINE
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-600">
        Simulate underlying event inputs to see how <code className="font-mono">EventComposer</code> evaluates the composite condition and how <code className="font-mono">Market.sol</code> splits the pool.
      </p>

      {/* Simulator Inputs */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="border border-gray-300 bg-paper p-3 rounded-sm">
          <label className="block text-[11px] font-mono uppercase text-gray-500 mb-1 font-semibold">
            Operand A (BTC &gt; $100k)
          </label>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setOperand1Outcome(true)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                operand1Outcome ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              TRUE
            </button>
            <button
              onClick={() => setOperand1Outcome(false)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                !operand1Outcome ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              FALSE
            </button>
          </div>
        </div>

        <div className="border border-gray-300 bg-paper p-3 rounded-sm">
          <label className="block text-[11px] font-mono uppercase text-gray-500 mb-1 font-semibold">
            Operand B (Fed Rate Cut)
          </label>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setOperand2Outcome(true)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                operand2Outcome ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              TRUE
            </button>
            <button
              onClick={() => setOperand2Outcome(false)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                !operand2Outcome ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              FALSE
            </button>
          </div>
        </div>

        <div className="border border-gray-300 bg-paper p-3 rounded-sm">
          <label className="block text-[11px] font-mono uppercase text-gray-500 mb-1 font-semibold">
            Time Window (Δt ≤ 48h)
          </label>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setWithinWindow(true)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                withinWindow ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              WITHIN 48H
            </button>
            <button
              onClick={() => setWithinWindow(false)}
              className={cn(
                "flex-1 py-1 text-xs font-mono rounded border transition-colors",
                !withinWindow ? "border-ink bg-ink text-paper font-semibold" : "border-gray-300 bg-paper text-gray-600 hover:text-ink"
              )}
            >
              EXCEEDED
            </button>
          </div>
        </div>
      </div>

      {/* Simulator Output Box */}
      <div className="mt-4 border border-ink bg-paper p-4 rounded-sm flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="font-mono text-[10px] uppercase text-gray-500 font-semibold block">
            Evaluated Composite Outcome
          </span>
          <span className="font-mono text-xl font-bold text-ink flex items-center gap-2 mt-0.5">
            {simulatedOutcome ? (
              <span className="text-ink flex items-center gap-1.5">
                <Check className="h-5 w-5 stroke-[2.5]" />
                SETTLES TO YES (TRUE)
              </span>
            ) : (
              <span className="text-gray-700 flex items-center gap-1.5">
                SETTLES TO NO (FALSE)
              </span>
            )}
          </span>
        </div>

        <div className="text-right font-mono">
          <span className="text-[10px] uppercase text-gray-500 font-semibold block">
            Winning Pool Payout
          </span>
          <span className="text-sm font-bold text-ink">
            {simulatedOutcome
              ? `YES Pool splits ${totalPool.toFixed(2)} ETH`
              : `NO Pool splits ${totalPool.toFixed(2)} ETH`}
          </span>
        </div>
      </div>
    </div>
  );
}
