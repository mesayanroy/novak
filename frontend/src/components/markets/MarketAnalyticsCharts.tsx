"use client";

import { useState, useId } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  PieChart as PieIcon,
  BarChart2,
} from "lucide-react";

// Timeframe options
export type Timeframe = "1H" | "24H" | "7D" | "ALL";

// Mock history data generator per timeframe
const priceHistoryData: Record<Timeframe, Array<{ time: string; yesProb: number; noProb: number; volumeEth: number }>> = {
  "1H": [
    { time: "14:00", yesProb: 68, noProb: 32, volumeEth: 0.12 },
    { time: "14:15", yesProb: 71, noProb: 29, volumeEth: 0.35 },
    { time: "14:30", yesProb: 69, noProb: 31, volumeEth: 0.22 },
    { time: "14:45", yesProb: 74, noProb: 26, volumeEth: 0.58 },
    { time: "15:00", yesProb: 74.7, noProb: 25.3, volumeEth: 0.41 },
  ],
  "24H": [
    { time: "00:00", yesProb: 52, noProb: 48, volumeEth: 0.8 },
    { time: "04:00", yesProb: 55, noProb: 45, volumeEth: 1.2 },
    { time: "08:00", yesProb: 61, noProb: 39, volumeEth: 1.9 },
    { time: "12:00", yesProb: 64, noProb: 36, volumeEth: 2.4 },
    { time: "16:00", yesProb: 70, noProb: 30, volumeEth: 3.1 },
    { time: "20:00", yesProb: 72, noProb: 28, volumeEth: 2.8 },
    { time: "Now", yesProb: 74.7, noProb: 25.3, volumeEth: 4.55 },
  ],
  "7D": [
    { time: "Sep 16", yesProb: 40, noProb: 60, volumeEth: 2.1 },
    { time: "Sep 17", yesProb: 45, noProb: 55, volumeEth: 3.4 },
    { time: "Sep 18", yesProb: 50, noProb: 50, volumeEth: 4.0 },
    { time: "Sep 19", yesProb: 58, noProb: 42, volumeEth: 5.2 },
    { time: "Sep 20", yesProb: 65, noProb: 35, volumeEth: 6.8 },
    { time: "Sep 21", yesProb: 71, noProb: 29, volumeEth: 8.1 },
    { time: "Today", yesProb: 74.7, noProb: 25.3, volumeEth: 9.6 },
  ],
  ALL: [
    { time: "Aug 2026", yesProb: 30, noProb: 70, volumeEth: 1.5 },
    { time: "Late Aug", yesProb: 42, noProb: 58, volumeEth: 4.2 },
    { time: "Early Sep", yesProb: 55, noProb: 45, volumeEth: 7.9 },
    { time: "Mid Sep", yesProb: 68, noProb: 32, volumeEth: 12.4 },
    { time: "Current", yesProb: 74.7, noProb: 25.3, volumeEth: 16.2 },
  ],
};

/* ============================================================================
   1. Interactive Price & Probability Trend Line/Area Chart
   ============================================================================ */
export function PriceHistoryChart({
  marketTitle,
  currentYesProb = 74.7,
}: {
  marketTitle?: string;
  currentYesProb?: number;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartGradientId = useId();

  const points = priceHistoryData[timeframe];
  const activeData = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];

  const svgWidth = 600;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  const width = svgWidth - paddingX * 2;
  const height = svgHeight - paddingY * 2;

  const minProb = Math.min(...points.map((p) => p.yesProb)) - 5;
  const maxProb = Math.max(...points.map((p) => p.yesProb)) + 5;
  const range = Math.max(maxProb - minProb, 1);

  const coordinates = points.map((p, index) => {
    const x = paddingX + (index / (points.length - 1)) * width;
    const y = paddingY + height - ((p.yesProb - minProb) / range) * height;
    return { x, y, ...p };
  });

  // Construct SVG path command
  const lineD = coordinates.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, "");

  const areaD = `${lineD} L ${coordinates[coordinates.length - 1].x},${paddingY + height} L ${coordinates[0].x},${paddingY + height} Z`;

  // Calculate percentage uplift
  const initialProb = points[0].yesProb;
  const uplift = activeData.yesProb - initialProb;
  const upliftPercent = ((uplift / initialProb) * 100).toFixed(1);
  const isPositive = uplift >= 0;

  return (
    <div className="border border-gray-300 bg-paper p-5 rounded-sm shadow-sm">
      {/* Top Controls & Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 font-semibold">
            <Activity className="h-3.5 w-3.5 text-ink animate-pulse-subtle" />
            Live Outcome Odds &amp; Probability Curve
          </div>
          {marketTitle && (
            <h3 className="mt-1 text-sm font-semibold text-ink line-clamp-1">{marketTitle}</h3>
          )}
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-bold font-mono text-ink tracking-tight">
              {activeData.yesProb.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-gray-500">YES Odds</span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-sm ${
                isPositive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {isPositive ? `+${upliftPercent}%` : `${upliftPercent}%`}
            </span>
          </div>
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center border border-gray-300 rounded p-0.5 text-xs font-mono bg-gray-50">
          {(["1H", "24H", "7D", "ALL"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => {
                setTimeframe(tf);
                setHoverIndex(null);
              }}
              className={`px-2.5 py-1 rounded-sm transition-colors font-semibold ${
                timeframe === tf ? "bg-ink text-paper" : "text-gray-600 hover:text-ink"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#111827" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#111827" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={svgWidth - paddingX}
            y2={paddingY}
            stroke="#E5E7EB"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingY + height / 2}
            x2={svgWidth - paddingX}
            y2={paddingY + height / 2}
            stroke="#E5E7EB"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingY + height}
            x2={svgWidth - paddingX}
            y2={paddingY + height}
            stroke="#D1D5DB"
          />

          {/* Area Fill */}
          <path d={areaD} fill={`url(#${chartGradientId})`} />

          {/* Line Path */}
          <path d={lineD} fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" />

          {/* Interactive Data Points */}
          {coordinates.map((pt, idx) => {
            const isHovered = hoverIndex === idx;
            return (
              <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
                {/* Invisible hover area */}
                <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" className="cursor-pointer" />

                {/* Point circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "5" : "3.5"}
                  fill={isHovered ? "#111827" : "#FFFFFF"}
                  stroke="#111827"
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                />

                {/* X Axis Labels */}
                <text
                  x={pt.x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  className="fill-gray-500 text-[10px] font-mono"
                >
                  {pt.time}
                </text>
              </g>
            );
          })}

          {/* Hover Crosshair */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={coordinates[hoverIndex].x}
                y1={paddingY}
                x2={coordinates[hoverIndex].x}
                y2={paddingY + height}
                stroke="#9CA3AF"
                strokeDasharray="2 2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Footer Metrics */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs font-mono text-gray-500">
        <div className="flex items-center gap-4">
          <span>
            24h Volume: <strong className="text-ink font-semibold">{activeData.volumeEth} ETH</strong>
          </span>
          <span>
            NO Odds: <strong className="text-ink font-semibold">{activeData.noProb.toFixed(1)}%</strong>
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px]">
          <Sparkles className="h-3 w-3 text-ink" /> Verified on EventBus
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
   2. Outcome & Pool Stake Distribution Donut/Pie Chart
   ============================================================================ */
export function OutcomeDistributionPieChart({
  yesPoolEth = 3.4,
  noPoolEth = 1.15,
}: {
  yesPoolEth?: number;
  noPoolEth?: number;
}) {
  const totalEth = yesPoolEth + noPoolEth;
  const yesRatio = (yesPoolEth / totalEth) * 100;
  const noRatio = (noPoolEth / totalEth) * 100;

  // Donut SVG constants
  const size = 180;
  const strokeWidth = 24;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const yesDashoffset = circumference - (yesRatio / 100) * circumference;

  return (
    <div className="border border-gray-300 bg-paper p-5 rounded-sm shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 font-semibold">
            <PieIcon className="h-3.5 w-3.5 text-ink" />
            Collateral Pool Distribution
          </div>
          <span className="font-mono text-xs border border-gray-300 px-1.5 py-0.5 rounded text-ink font-bold">
            PARIMUTUEL
          </span>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
          {/* SVG Donut */}
          <div className="relative flex items-center justify-center">
            <svg width={size} height={size} className="transform -rotate-90 overflow-visible">
              {/* NO Segment (Base circle) */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="#6B7280"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={0}
              />
              {/* YES Segment */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="#111827"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={yesDashoffset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-xs text-gray-500 uppercase font-semibold">Total Pool</span>
              <span className="font-mono text-xl font-bold text-ink">{totalEth.toFixed(2)} ETH</span>
            </div>
          </div>

          {/* Breakdown Legend */}
          <div className="flex flex-col gap-3 w-full sm:w-auto font-mono text-xs">
            <div className="border border-gray-200 bg-gray-50 p-3 rounded-sm min-w-[160px]">
              <div className="flex items-center justify-between text-gray-600 mb-1">
                <span className="flex items-center gap-1.5 font-bold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink inline-block" />
                  YES Pool
                </span>
                <span className="font-bold text-ink">{yesRatio.toFixed(1)}%</span>
              </div>
              <p className="text-sm font-bold text-ink">{yesPoolEth.toFixed(2)} ETH</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Implied Payout: {(totalEth / yesPoolEth).toFixed(2)}x</p>
            </div>

            <div className="border border-gray-200 bg-paper p-3 rounded-sm min-w-[160px]">
              <div className="flex items-center justify-between text-gray-600 mb-1">
                <span className="flex items-center gap-1.5 font-bold text-gray-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-500 inline-block" />
                  NO Pool
                </span>
                <span className="font-bold text-gray-700">{noRatio.toFixed(1)}%</span>
              </div>
              <p className="text-sm font-bold text-ink">{noPoolEth.toFixed(2)} ETH</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Implied Payout: {(totalEth / noPoolEth).toFixed(2)}x</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] font-mono text-gray-500">
        <span>Oracle Fee: <strong className="text-ink">0.00% (Fee-free EventBus)</strong></span>
        <span>Consensus: <strong className="text-ink">Finalized</strong></span>
      </div>
    </div>
  );
}

/* ============================================================================
   3. Event & Volume Histogram
   ============================================================================ */
export function VolumeHistogram() {
  const histogramBars = [
    { label: "00h", vol: 0.4 },
    { label: "04h", vol: 1.2 },
    { label: "08h", vol: 2.5 },
    { label: "12h", vol: 4.8 },
    { label: "16h", vol: 3.2 },
    { label: "20h", vol: 6.1 },
    { label: "Now", vol: 8.4 },
  ];

  const maxVol = Math.max(...histogramBars.map((b) => b.vol));

  return (
    <div className="border border-gray-300 bg-paper p-5 rounded-sm shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 font-semibold">
          <BarChart2 className="h-3.5 w-3.5 text-ink" />
          Event Resolution &amp; Volume Histogram
        </div>
        <span className="font-mono text-[11px] text-gray-500">24H TICKER</span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-3 h-36 px-2">
        {histogramBars.map((bar, i) => {
          const heightPercent = (bar.vol / maxVol) * 100;
          return (
            <div key={i} className="flex flex-col items-center flex-1 h-full justify-end group">
              <span className="font-mono text-[10px] text-gray-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {bar.vol} ETH
              </span>

              {/* Bar container */}
              <div className="w-full max-w-[28px] bg-gray-100 rounded-t-sm overflow-hidden relative border border-gray-200">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPercent}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="w-full bg-ink"
                />
              </div>

              <span className="font-mono text-[10px] text-gray-500 mt-2">{bar.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-mono text-gray-500">
        <span>Average Latency: <strong className="text-ink">12.4s</strong></span>
        <span>Resolution Rate: <strong className="text-ink">99.8%</strong></span>
      </div>
    </div>
  );
}

/* ============================================================================
   4. Live Trading Positions Telemetry Table
   ============================================================================ */
export interface LivePositionItem {
  id: string;
  marketQuestion: string;
  position: "YES" | "NO";
  stakeEth: string;
  entryOdds: number;
  currentOdds: number;
  unrealizedPnlEth: string;
  pnlPercent: number;
  isUplifting: boolean;
  underlyingType: "Primitive" | "Composite";
}

export const mockLivePositions: LivePositionItem[] = [
  {
    id: "0xpos-101",
    marketQuestion: "Fed holds AND ETH > $5,000 within 48h",
    position: "YES",
    stakeEth: "0.50",
    entryOdds: 58.0,
    currentOdds: 74.7,
    unrealizedPnlEth: "+0.144",
    pnlPercent: 28.8,
    isUplifting: true,
    underlyingType: "Composite",
  },
  {
    id: "0xpos-102",
    marketQuestion: "Novak Issue #21 passes governance",
    position: "NO",
    stakeEth: "0.25",
    entryOdds: 50.0,
    currentOdds: 45.0,
    unrealizedPnlEth: "+0.025",
    pnlPercent: 10.0,
    isUplifting: true,
    underlyingType: "Primitive",
  },
  {
    id: "0xpos-103",
    marketQuestion: "US CPI Inflation < 2.5% in Q4 2026",
    position: "YES",
    stakeEth: "0.80",
    entryOdds: 65.0,
    currentOdds: 62.0,
    unrealizedPnlEth: "-0.037",
    pnlPercent: -4.6,
    isUplifting: false,
    underlyingType: "Primitive",
  },
];

export function LivePositionsTable() {
  return (
    <div className="border border-gray-300 bg-paper p-5 rounded-sm shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Active Trading Positions Telemetry
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Real-time positions backed by on-chain parimutuel collateral pools &amp; EventBus.
          </p>
        </div>
        <span className="font-mono text-xs border border-gray-300 bg-gray-50 px-2 py-1 rounded text-ink font-semibold">
          3 ACTIVE POSITIONS
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-gray-100 text-gray-600 uppercase tracking-wider border-b border-gray-300">
            <tr>
              <th className="p-3 font-semibold">Event Market</th>
              <th className="p-3 font-semibold">Position</th>
              <th className="p-3 font-semibold">Stake</th>
              <th className="p-3 font-semibold">Entry / Current</th>
              <th className="p-3 font-semibold">Market Uplift</th>
              <th className="p-3 font-semibold">Unrealized PnL</th>
              <th className="p-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-paper">
            {mockLivePositions.map((pos) => (
              <tr key={pos.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-3 font-sans font-medium text-ink max-w-xs">
                  <div className="line-clamp-1">{pos.marketQuestion}</div>
                  <span className="font-mono text-[10px] text-gray-500">{pos.underlyingType} Feed</span>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                      pos.position === "YES" ? "bg-ink text-paper" : "bg-gray-200 text-gray-800"
                    }`}
                  >
                    {pos.position}
                  </span>
                </td>
                <td className="p-3 font-bold text-ink">{pos.stakeEth} ETH</td>
                <td className="p-3 text-gray-600">
                  <span>{pos.entryOdds}%</span> → <strong className="text-ink">{pos.currentOdds}%</strong>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded-sm ${
                      pos.isUplifting
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {pos.isUplifting ? (
                      <>
                        <ArrowUpRight className="h-3 w-3" /> UPLIFTING
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-3 w-3" /> SLIDING
                      </>
                    )}
                  </span>
                </td>
                <td className="p-3 font-bold">
                  <span className={pos.pnlPercent >= 0 ? "text-emerald-700" : "text-rose-700"}>
                    {pos.unrealizedPnlEth} ETH ({pos.pnlPercent >= 0 ? `+${pos.pnlPercent}%` : `${pos.pnlPercent}%`})
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button className="link-plain border border-gray-300 hover:border-ink bg-paper px-2.5 py-1 text-[11px] uppercase tracking-wide text-ink font-semibold rounded-sm">
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
