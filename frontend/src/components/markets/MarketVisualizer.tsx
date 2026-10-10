"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Zap,
  ArrowRight,
  AlertTriangle,
  Info,
  DollarSign,
  PieChart as PieIcon,
  Layers,
  Sparkles,
} from "lucide-react";
import { fmtTime, fmtUsdg, USDG_DECIMALS, type LiveMarket } from "@/lib/novak";
import { MarketStatus } from "@novakoracle/sdk";
import { cn } from "@/lib/utils";
import { ResolutionTimeline } from "./ResolutionTimeline";

export function MarketVisualizer({ market }: { market: LiveMarket }) {
  const [simSide, setSimSide] = useState<"YES" | "NO">("YES");
  const [simAmountStr, setSimAmountStr] = useState<string>("100");

  const yesPoolRaw = Number(market.yesPool) / 10 ** USDG_DECIMALS;
  const noPoolRaw = Number(market.noPool) / 10 ** USDG_DECIMALS;
  const totalPoolRaw = yesPoolRaw + noPoolRaw;

  // Implied Probabilities (50/50 fallback if empty pool)
  const yesProb = totalPoolRaw > 0 ? (yesPoolRaw / totalPoolRaw) * 100 : 50;
  const noProb = totalPoolRaw > 0 ? (noPoolRaw / totalPoolRaw) * 100 : 50;

  // Multipliers (Parimutuel: payout per 1 USDG staked if winning, before fee)
  // Win payout = stake + stake * (loserPool - fee) / winnerPool
  // Assuming 1% fee (100 bps)
  const feePct = 0.01;
  const yesMultiplier =
    yesPoolRaw > 0 ? 1 + (noPoolRaw * (1 - feePct)) / yesPoolRaw : 2.0;
  const noMultiplier =
    noPoolRaw > 0 ? 1 + (yesPoolRaw * (1 - feePct)) / noPoolRaw : 2.0;

  // Simulator Calculations
  const simAmount = Math.max(0, parseFloat(simAmountStr) || 0);
  const simYesPool = simSide === "YES" ? yesPoolRaw + simAmount : yesPoolRaw;
  const simNoPool = simSide === "NO" ? noPoolRaw + simAmount : noPoolRaw;
  const simTotalPool = simYesPool + simNoPool;

  const simYesProb = simTotalPool > 0 ? (simYesPool / simTotalPool) * 100 : 50;
  const simNoProb = simTotalPool > 0 ? (simNoPool / simTotalPool) * 100 : 50;

  // Projected Payout for user's simulated stake
  const simWinnerPool = simSide === "YES" ? simYesPool : simNoPool;
  const simLoserPool = simSide === "YES" ? simNoPool : simYesPool;
  const simFeeTaken = simLoserPool * feePct;
  const simEstPayout =
    simWinnerPool > 0
      ? simAmount + (simAmount * (simLoserPool - simFeeTaken)) / simWinnerPool
      : simAmount;
  const simNetProfit = simEstPayout - simAmount;
  const simRoi = simAmount > 0 ? (simNetProfit / simAmount) * 100 : 0;

  // Timeline / Stepper Status
  const nowUnix = Math.floor(Date.now() / 1000);
  const isTradingOpen =
    market.status === MarketStatus.Open &&
    nowUnix < Number(market.tradingClosesAt);
  const isAwaitingResolution =
    market.status === MarketStatus.Open &&
    nowUnix >= Number(market.tradingClosesAt);
  const isSettled = market.status === MarketStatus.Settled;
  const isRefunding = market.status === MarketStatus.Refunding;

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header Card */}
      <div className="border border-gray-300 bg-paper p-6 rounded-sm shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Market Visualizer &amp; Distribution Engine
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Sparkles className="h-3 w-3" /> Parimutuel Solvent
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200">
              1% Fee Cap
            </span>
          </div>
        </div>

        {/* Odds & Distribution Histogram Bars */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2 font-mono text-xs">
            <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              YES ({yesProb.toFixed(1)}%) — {yesMultiplier.toFixed(2)}x Odds
            </span>
            <span className="text-gray-500">
              Total Liquidity: <strong className="text-ink font-semibold">{fmtUsdg(market.yesPool + market.noPool)} USDG</strong>
            </span>
            <span className="font-semibold text-rose-700 flex items-center gap-1.5">
              NO ({noProb.toFixed(1)}%) — {noMultiplier.toFixed(2)}x Odds
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
          </div>

          {/* Histogram Bar Graphic */}
          <div className="h-6 w-full bg-gray-100 rounded-md overflow-hidden flex border border-gray-300 p-0.5 relative shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${yesProb}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-emerald-500 text-paper font-mono text-[10px] font-bold flex items-center justify-start pl-2 rounded-l-sm"
            >
              {yesProb > 15 && `YES ${yesProb.toFixed(1)}%`}
            </motion.div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${noProb}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-rose-500 text-paper font-mono text-[10px] font-bold flex items-center justify-end pr-2 rounded-r-sm"
            >
              {noProb > 15 && `NO ${noProb.toFixed(1)}%`}
            </motion.div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="border border-emerald-200 bg-emerald-50/50 p-3 rounded-sm">
              <div className="text-emerald-800 font-semibold uppercase text-[11px]">
                YES Outcome Pool
              </div>
              <div className="mt-1 text-lg font-bold text-emerald-900">
                ${yesPoolRaw.toLocaleString()} USDG
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-700">
                Implied Multiplier: {yesMultiplier.toFixed(2)}x payout
              </div>
            </div>

            <div className="border border-rose-200 bg-rose-50/50 p-3 rounded-sm text-right">
              <div className="text-rose-800 font-semibold uppercase text-[11px]">
                NO Outcome Pool
              </div>
              <div className="mt-1 text-lg font-bold text-rose-900">
                ${noPoolRaw.toLocaleString()} USDG
              </div>
              <div className="mt-0.5 text-[11px] text-rose-700">
                Implied Multiplier: {noMultiplier.toFixed(2)}x payout
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Trade Simulator */}
      <div className="border border-gray-300 bg-gray-50/70 p-6 rounded-sm">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold text-ink">
            <Zap className="h-4 w-4 text-amber-500" />
            Interactive Trade &amp; ROI Simulator
          </div>
          <span className="font-mono text-[11px] bg-paper border border-gray-300 px-2 py-0.5 rounded text-gray-600">
            Real-time Pool Depth Simulator
          </span>
        </div>

        <p className="mt-2 text-xs text-gray-600">
          Simulate depositing collateral to see how your trade shifts the implied probability, pool depth, and expected ROI upon resolution.
        </p>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {/* Controls */}
          <div className="flex flex-col gap-4 bg-paper border border-gray-300 p-4 rounded-sm">
            <div>
              <label className="block text-[11px] font-mono uppercase text-gray-500 font-semibold mb-1.5">
                1. Select Side to Back
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSimSide("YES")}
                  className={cn(
                    "py-2 text-xs font-mono font-semibold rounded border transition-colors flex items-center justify-center gap-2",
                    simSide === "YES"
                      ? "border-emerald-600 bg-emerald-600 text-paper"
                      : "border-gray-300 bg-paper text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  BACK YES
                </button>
                <button
                  onClick={() => setSimSide("NO")}
                  className={cn(
                    "py-2 text-xs font-mono font-semibold rounded border transition-colors flex items-center justify-center gap-2",
                    simSide === "NO"
                      ? "border-rose-600 bg-rose-600 text-paper"
                      : "border-gray-300 bg-paper text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  BACK NO
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-gray-500 font-semibold mb-1.5">
                2. Simulated Collateral Amount (USDG)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={simAmountStr}
                  onChange={(e) => setSimAmountStr(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ink"
                  placeholder="100"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2 mt-2">
                {[25, 50, 100, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setSimAmountStr(preset.toString())}
                    className="flex-1 py-1 text-[11px] font-mono border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded transition-colors"
                  >
                    +${preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Output */}
          <div className="bg-paper border border-ink p-4 rounded-sm flex flex-col justify-between">
            <div>
              <span className="font-mono text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                Simulated Outcome Matrix
              </span>

              <div className="mt-3 flex items-center justify-between border-b border-gray-200 pb-2">
                <span className="text-xs text-gray-600">Simulated Deposit:</span>
                <span className="font-mono text-sm font-semibold text-ink">${simAmount.toLocaleString()} USDG</span>
              </div>

              <div className="mt-2 flex items-center justify-between border-b border-gray-200 pb-2">
                <span className="text-xs text-gray-600">New Pool Probability Shift:</span>
                <span className="font-mono text-xs font-semibold text-ink">
                  {simSide === "YES" ? (
                    <span className="text-emerald-700">YES {yesProb.toFixed(1)}% → {simYesProb.toFixed(1)}%</span>
                  ) : (
                    <span className="text-rose-700">NO {noProb.toFixed(1)}% → {simNoProb.toFixed(1)}%</span>
                  )}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between border-b border-gray-200 pb-2">
                <span className="text-xs text-gray-600">Projected Winning Payout:</span>
                <span className="font-mono text-sm font-bold text-emerald-700">
                  ${simEstPayout.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDG
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-600">Estimated Net Profit / ROI:</span>
                <span className="font-mono text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  +${simNetProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })} ({simRoi.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-200 text-[11px] text-gray-500 font-mono flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 flex-none" />
              Calculated using standard Novak parimutuel pool mechanics (1% fee deducted from losing pool).
            </div>
          </div>
        </div>
      </div>

      {/* Lifecycle timeline, from chain state */}
      <ResolutionTimeline
        events={[market.event]}
        tradingClosesAt={market.tradingClosesAt}
        settled={market.status === MarketStatus.Settled}
        refunding={market.status === MarketStatus.Refunding}
        outcomeLabel={market.status === MarketStatus.Settled ? (market.outcome ? "YES" : "NO") : undefined}
      />
    </div>
  );
}
