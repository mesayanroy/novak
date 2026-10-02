"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Cpu,
  Database,
  Code2,
  AppWindow,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Scale,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Flame,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function OracleArchitectureGuide() {
  const [activeLayer, setActiveLayer] = useState<number>(3);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-10">
      {/* Hero Header */}
      <div className="border border-gray-300 bg-paper p-6 rounded-sm shadow-sm relative overflow-hidden">
        <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full mb-3">
          <ShieldCheck className="h-3.5 w-3.5" /> Novak Oracle Architecture
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          &ldquo;Chainlink tells your contract the price. Novak tells it what happened.&rdquo;
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-3xl leading-relaxed">
          Novak is the event layer for tokenized stocks on <strong>Robinhood Chain</strong>. Real-world facts about stock tokens
          (corporate actions, trading status, price-at-time conditions) are resolved, finalized, composed (AND/OR/NOT, BEFORE/WITHIN), and consumed safely by on-chain applications.
        </p>
      </div>

      {/* Interactive 5-Layer Flowchart */}
      <div className="border border-gray-300 bg-gray-50/80 p-6 rounded-sm">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="font-mono text-sm font-semibold uppercase text-ink flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-600" />
            5-Layer Architecture Flowchart (Click any node to explore)
          </h3>
          <span className="font-mono text-xs text-gray-500">
            Source → Registry → Dispute → EventBus → Market
          </span>
        </div>

        {/* Nodes Horizontal Pipeline */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-2 relative">
          <FlowNode
            step={1}
            title="01. Data Source"
            subtitle="Robinhood Chain Mainnet"
            icon={Database}
            active={activeLayer === 1}
            onClick={() => setActiveLayer(1)}
          />
          <FlowNode
            step={2}
            title="02. Resolver Quorum"
            subtitle="N-of-M + Evidence Hash"
            icon={Cpu}
            active={activeLayer === 2}
            onClick={() => setActiveLayer(2)}
          />
          <FlowNode
            step={3}
            title="03. Dispute Manager"
            subtitle="Bonded 2-Tier Committee"
            icon={ShieldCheck}
            active={activeLayer === 3}
            onClick={() => setActiveLayer(3)}
          />
          <FlowNode
            step={4}
            title="04. Event Bus &amp; Composer"
            subtitle="Canonical Composite DAG"
            icon={Code2}
            active={activeLayer === 4}
            onClick={() => setActiveLayer(4)}
          />
          <FlowNode
            step={5}
            title="05. Market &amp; Settlement"
            subtitle="Pull-Only Consumer"
            icon={AppWindow}
            active={activeLayer === 5}
            onClick={() => setActiveLayer(5)}
          />
        </div>

        {/* Selected Layer Detail Box */}
        <div className="mt-6 border border-ink bg-paper p-5 rounded-sm shadow-sm">
          {activeLayer === 1 && (
            <LayerDetail
              num="01"
              name="Data Sources (Robinhood Chain Mainnet)"
              contract="Chainlink Price Feeds &amp; ERC-8056 Stock Tokens"
              desc="Novak resolver daemons read mainnet Robinhood Chain data sources — Chainlink stock price feeds, stock token corporate action logs, and Robinhood asset registry status. Data is verified off-chain prior to on-chain submission."
              interfaces={["Chainlink Price Feeds", "ERC-8056 Corporate Actions", "Trading Status Registry"]}
            />
          )}
          {activeLayer === 2 && (
            <LayerDetail
              num="02"
              name="Resolver Network &amp; Evidence Hashing"
              contract="contracts/EventRegistry.sol"
              desc="Independent resolvers watch data sources and submit observations containing outcome + evidence hash. When N-of-M resolvers agree on exact outcome payload, EventRegistry automatically proposes the outcome."
              interfaces={["submitObservation()", "getEventSpec()", "getProposedOutcome()"]}
            />
          )}
          {activeLayer === 3 && (
            <LayerDetail
              num="03"
              name="Dispute Manager &amp; Committee Ladder"
              contract="contracts/DisputeManager.sol"
              desc="Proposed outcomes enter a challenge window. Anyone can post a bond to dispute. Disputes are arbitrated by a two-tier committee of bonded resolvers (Tier 1 ≤ 7, Tier 2 ≤ 15) — NEVER a token-weighted vote. If committees fail to converge, the event is marked VOIDED."
              interfaces={["dispute()", "voteTier1()", "escalateNonConvergence()", "finalizeFromDispute()"]}
            />
          )}
          {activeLayer === 4 && (
            <LayerDetail
              num="04"
              name="Event Bus &amp; Event Composer"
              contract="contracts/EventBus.sol &amp; EventComposer.sol"
              desc="Finalized primitive events are stored in EventBus. EventComposer builds composite logic events (AND, OR, NOT, BEFORE, WITHIN) deterministically. Composite identities are canonicalized for order-independent operators, preventing duplicate state."
              interfaces={["getAvailability()", "registerComposite()", "tryResolve()", "IEventBus"]}
            />
          )}
          {activeLayer === 5 && (
            <LayerDetail
              num="05"
              name="Derivatives Market &amp; Settlement"
              contract="derivatives/Market.sol &amp; Settlement.sol"
              desc="Binary parimutuel USDG markets settle exclusively against EventBus via Settlement.sol. Markets never depend directly on a resolver, Registry, or DisputeManager. If an event is Voided, Market.sol opens 100% collateral refunds."
              interfaces={["settle()", "claim()", "depositCollateral()", "closePosition()"]}
            />
          )}
        </div>
      </div>

      {/* Comparison Matrix Table: Novak vs UMA vs Chainlink */}
      <div className="border border-gray-300 bg-paper p-6 rounded-sm">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-emerald-600" />
            <h3 className="font-mono text-sm font-semibold uppercase text-ink">
              Oracle Architecture Comparison: Novak vs. UMA vs. Chainlink
            </h3>
          </div>
          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
            Robinhood Chain Track Matrix
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-100 font-mono text-[11px] uppercase text-gray-700">
                <th className="p-3">Feature / Dimension</th>
                <th className="p-3 bg-emerald-50/80 text-emerald-900 font-bold border-x border-emerald-200">
                  Novak (Robinhood Chain Event Oracle)
                </th>
                <th className="p-3">UMA (Optimistic Token Voting)</th>
                <th className="p-3">Chainlink (Price Feed Oracle)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-mono">
              <tr>
                <td className="p-3 font-semibold text-ink">Primary Data Domain</td>
                <td className="p-3 bg-emerald-50/30 font-semibold text-emerald-900 border-x border-emerald-200">
                  Stock Token Real-World Events (Corporate Actions, Halts, Composite Conditions)
                </td>
                <td className="p-3 text-gray-700">Generic Arbitrary Text Questions / Off-Chain Data</td>
                <td className="p-3 text-gray-700">Financial Price Feeds (Data Source for Novak)</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-ink">Dispute Resolution Engine</td>
                <td className="p-3 bg-emerald-50/30 font-bold text-emerald-900 border-x border-emerald-200">
                  Bonded 2-Tier Committee Ladder (≤7 Tier-1, ≤15 Tier-2 Resolvers)
                </td>
                <td className="p-3 text-rose-700 font-medium">Token-Weighted Governance Vote (UMA Token Holders)</td>
                <td className="p-3 text-gray-700">N/A (Multi-Node Quorum without dispute layer)</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-ink">Bribery &amp; Whale Attack Risk</td>
                <td className="p-3 bg-emerald-50/30 text-emerald-900 font-bold border-x border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> ZERO (No governance token, non-convergence refunds)
                </td>
                <td className="p-3 text-rose-700 font-medium flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-rose-600" /> HIGH (Whales can buy UMA tokens to sway votes)
                </td>
                <td className="p-3 text-gray-700">N/A (Consensus among node operators)</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-ink">Non-Convergence Guarantee</td>
                <td className="p-3 bg-emerald-50/30 text-emerald-900 font-bold border-x border-emerald-200">
                  Event marked VOIDED → 100% User Deposit Refund
                </td>
                <td className="p-3 text-gray-700">Token Slashing / Stalemate</td>
                <td className="p-3 text-gray-700">Stale Price / Circuit Breaker</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-ink">Contract Coupling</td>
                <td className="p-3 bg-emerald-50/30 text-emerald-900 font-bold border-x border-emerald-200">
                  Strict Pull-Only via EventBus (Zero Resolver Dependency)
                </td>
                <td className="p-3 text-gray-700">Optimistic Callback / Callback Request</td>
                <td className="p-3 text-gray-700">Read-only Aggregator Interface</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-ink">Logic Composition</td>
                <td className="p-3 bg-emerald-50/30 text-emerald-900 font-bold border-x border-emerald-200">
                  Native On-Chain EventComposer (AND, OR, NOT, BEFORE, WITHIN)
                </td>
                <td className="p-3 text-gray-700">Manual Sub-Queries</td>
                <td className="p-3 text-gray-700">None (Price Data Only)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Conflict Resolution Deep-Dive Accordion */}
      <div className="border border-gray-300 bg-gray-50/80 p-6 rounded-sm">
        <h3 className="font-mono text-sm font-semibold uppercase text-ink flex items-center gap-2 mb-4">
          <AlertOctagon className="h-4 w-4 text-amber-600" />
          How Conflict Resolution Works if Resolvers Disagree
        </h3>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="border border-gray-300 bg-paper p-4 rounded-sm">
            <span className="font-mono text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Stage 1: Quorum Observation
            </span>
            <h4 className="mt-2 font-mono text-xs font-semibold text-ink">N-of-M Resolvers Match</h4>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              Authorized resolvers submit observations with evidence hashes. If quorum matches exact outcome payload, it moves to proposed status.
            </p>
          </div>

          <div className="border border-gray-300 bg-paper p-4 rounded-sm">
            <span className="font-mono text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Stage 2: Committee Escalation
            </span>
            <h4 className="mt-2 font-mono text-xs font-semibold text-ink">DisputeManager Ladder</h4>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              Disputes open Tier-1 committee (≤7 resolvers, ≥66% agreement). Failing to converge escalates to Tier-2 (≤15 resolvers).
            </p>
          </div>

          <div className="border border-gray-300 bg-paper p-4 rounded-sm">
            <span className="font-mono text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Stage 3: Non-Convergence Refund
            </span>
            <h4 className="mt-2 font-mono text-xs font-semibold text-ink">100% Money-Back Guarantee</h4>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              If Tier-2 committee fails to converge, the event is permanently marked VOIDED. Market.sol opens refunds so everyone reclaims 100% of their stake!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  step,
  title,
  subtitle,
  icon: Icon,
  active,
  onClick,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border p-3 text-left rounded-sm transition-all flex flex-col justify-between cursor-pointer",
        active
          ? "border-emerald-600 bg-emerald-50/90 shadow-md ring-1 ring-emerald-600"
          : "border-gray-300 bg-paper hover:border-gray-400 hover:bg-gray-50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
            active ? "bg-emerald-600 text-paper" : "bg-gray-200 text-gray-700"
          )}
        >
          0{step}
        </span>
        <Icon className={cn("h-4 w-4", active ? "text-emerald-700" : "text-gray-400")} />
      </div>
      <h4 className="font-mono text-xs font-semibold text-ink leading-snug">{title}</h4>
      <p className="mt-0.5 text-[10px] text-gray-500 font-mono">{subtitle}</p>
    </button>
  );
}

function LayerDetail({
  num,
  name,
  contract,
  desc,
  interfaces,
}: {
  num: string;
  name: string;
  contract: string;
  desc: string;
  interfaces: string[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-2">
          <span className="bg-emerald-600 text-paper px-1.5 py-0.5 rounded text-[10px]">{num}</span>
          {name}
        </span>
        <code className="font-mono text-xs bg-gray-100 border border-gray-300 px-2 py-0.5 rounded text-gray-800">
          {contract}
        </code>
      </div>
      <p className="text-xs text-gray-700 leading-relaxed mt-2">{desc}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-gray-500 uppercase font-semibold">Key Functions / Interfaces:</span>
        {interfaces.map((iface) => (
          <span key={iface} className="font-mono text-[10px] bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-ink font-medium">
            {iface}
          </span>
        ))}
      </div>
    </div>
  );
}
