"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Scale,
  Layers,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  id: string;
  category: "mechanics" | "resolvers" | "disputes" | "fees" | "composite";
  question: string;
  answer: string;
  contractRef?: string;
}

const FAQ_DATA: FaqItem[] = [
  {
    id: "m1",
    category: "mechanics",
    question: "How do binary parimutuel distribution markets work on Novak?",
    answer:
      "A Novak market allows traders to deposit USDG collateral backing either YES or NO outcomes for a stock token event. Traders pool their funds together. Once the market settles, winning traders split the total losing pool pro-rata to their stake, plus get their original deposit back (minus a 1% protocol fee). If nobody backed the winning outcome, everyone receives a 100% refund of their stake with zero fees.",
    contractRef: "derivatives/Market.sol::depositCollateral / claim",
  },
  {
    id: "m2",
    category: "mechanics",
    question: "When does trading close, and why is early deposit stopping enforced?",
    answer:
      "Trading (both deposits and position closes) strictly stops at 'tradingClosesAt' (chosen at market creation before observation opens). Additionally, Market.sol checks Settlement -> EventBus: if the event is already decided (Available or Voided), deposits revert immediately. This prevents traders from depositing or withdrawing after an outcome becomes public knowledge.",
    contractRef: "derivatives/Market.sol::_requireTradingOpen",
  },
  {
    id: "r1",
    category: "resolvers",
    question: "How do independent resolvers verify real-world Robinhood stock token events?",
    answer:
      "Novak resolver daemons watch verified data sources on Robinhood Chain mainnet: Chainlink price feeds, ERC-8056 stock token corporate action logs, and Robinhood asset registry status. Each resolver computes the observation payload and submits it alongside a SHA256 evidence hash. Once N-of-M resolvers agree on the exact payload, an outcome is proposed.",
    contractRef: "contracts/EventRegistry.sol::submitObservation",
  },
  {
    id: "r2",
    category: "resolvers",
    question: "How does Novak's pull-only EventBus architecture protect consumer contracts?",
    answer:
      "Consumer contracts (Market.sol, StockLendingGuard.sol) depend strictly on IEventBus interface calls. They NEVER import or call a resolver, Registry, or DisputeManager contract directly. This guarantees zero tight coupling, zero dependency on single nodes, and clean auditability.",
    contractRef: "contracts/interfaces/IEventBus.sol",
  },
  {
    id: "d1",
    category: "disputes",
    question: "What happens if resolvers disagree or a conflict/problem occurs?",
    answer:
      "If a proposed outcome is disputed, DisputeManager opens a bonded two-tier committee escalation ladder. Tier-1 committee consists of ≤7 bonded resolvers requiring ≥66% agreement. If Tier-1 fails to converge, it escalates to Tier-2 (≤15 bonded resolvers). Crucially, disputes NEVER rely on token-weighted voting, eliminating governance bribery attacks.",
    contractRef: "contracts/DisputeManager.sol::dispute / escalateNonConvergence",
  },
  {
    id: "d2",
    category: "disputes",
    question: "What is the non-convergence guarantee if an event is Voided?",
    answer:
      "If a dispute committee fails to converge, or if nobody could observe the event before expiration, the event is permanently marked VOIDED. When a market's event is Voided, Market.sol automatically enters the 'Refunding' state. Every trader can call claim() to recover 100% of their original collateral. Funds are NEVER locked or burned.",
    contractRef: "derivatives/Market.sol::settle / claim",
  },
  {
    id: "f1",
    category: "fees",
    question: "How are protocol fees calculated and capped?",
    answer:
      "The protocol fee is capped at a maximum of 5% (MAX_FEE_BPS = 500) and defaults to 1% (100 bps). The fee is ONLY deducted from the winning side's share of the losing pool upon settlement. If a market results in a refund (Voided or empty winning pool), zero fee is taken.",
    contractRef: "derivatives/Market.sol::settle",
  },
  {
    id: "c1",
    category: "composite",
    question: "How do composite events work (AND, OR, NOT, BEFORE, WITHIN)?",
    answer:
      "EventComposer allows building composite logic rules out of primitive events (e.g. 'NVDA Split AND BTC ≥ $100k WITHIN 48h'). Composite identities are canonicalized for order-independent operators, preventing duplicate representations. If any operand is Voided or Expired, terminal-state propagation resolves the composite cleanly.",
    contractRef: "contracts/EventComposer.sol::registerComposite",
  },
];

export function DistributionMarketFAQ({ categoryFilter }: { categoryFilter?: string }) {
  const [activeTab, setActiveTab] = useState<string>(categoryFilter || "all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({ m1: true, d1: true });

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFaqs = FAQ_DATA.filter((item) => {
    const matchesTab = activeTab === "all" || item.category === activeTab;
    const matchesQuery =
      searchQuery === "" ||
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesQuery;
  });

  return (
    <div className="border border-gray-300 bg-paper p-6 rounded-sm shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-emerald-700 uppercase tracking-wider">
            <HelpCircle className="h-4 w-4" /> Market FAQ &amp; Dispute Resolution Instructions
          </div>
          <h3 className="text-xl font-bold text-ink mt-1">
            Distribution Market Rules &amp; Conflict Resolution
          </h3>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs &amp; rules..."
            className="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ink bg-gray-50/50"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5 border-b border-gray-200 pb-3">
        <TabChip active={activeTab === "all"} onClick={() => setActiveTab("all")}>
          All Questions ({FAQ_DATA.length})
        </TabChip>
        <TabChip active={activeTab === "mechanics"} onClick={() => setActiveTab("mechanics")}>
          Market Mechanics
        </TabChip>
        <TabChip active={activeTab === "resolvers"} onClick={() => setActiveTab("resolvers")}>
          Resolvers &amp; Oracles
        </TabChip>
        <TabChip active={activeTab === "disputes"} onClick={() => setActiveTab("disputes")}>
          Disputes &amp; Conflict Resolution
        </TabChip>
        <TabChip active={activeTab === "fees"} onClick={() => setActiveTab("fees")}>
          Fees &amp; Collateral
        </TabChip>
        <TabChip active={activeTab === "composite"} onClick={() => setActiveTab("composite")}>
          Composite Events
        </TabChip>
      </div>

      {/* FAQ Accordion List */}
      <div className="mt-6 flex flex-col gap-3">
        {filteredFaqs.length === 0 ? (
          <p className="text-xs font-mono text-gray-500 py-6 text-center">
            No matching questions found for &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = Boolean(openItems[faq.id]);
            return (
              <div
                key={faq.id}
                className={cn(
                  "border rounded-sm transition-all duration-200 overflow-hidden",
                  isOpen
                    ? "border-ink bg-gray-50/50 shadow-sm"
                    : "border-gray-200 bg-paper hover:border-gray-300"
                )}
              >
                <button
                  onClick={() => toggleItem(faq.id)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-medium text-sm text-ink hover:text-emerald-700"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="font-mono text-xs text-gray-400 flex-none">Q:</span>
                    {faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-500 flex-none" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-none" />
                  )}
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-4 pb-4 pt-1 border-t border-gray-200 text-xs text-gray-700 leading-relaxed font-sans"
                    >
                      <p className="mt-1">{faq.answer}</p>
                      {faq.contractRef && (
                        <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-gray-500 bg-paper border border-gray-200 px-2 py-1 rounded w-fit">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>On-Chain Verified: <code className="text-ink font-semibold">{faq.contractRef}</code></span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-mono rounded-sm transition-colors",
        active
          ? "bg-ink text-paper font-semibold"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
