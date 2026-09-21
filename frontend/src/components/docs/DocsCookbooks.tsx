"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Code2,
  Terminal,
  BookOpen,
  Copy,
  Check,
  ArrowRight,
  Layers,
  ShieldCheck,
  Zap,
  Cpu,
  GitBranch,
  FileCode2,
} from "lucide-react";

export interface CookbookCard {
  id: string;
  title: string;
  category: "COMPOSITION" | "RESOLVER" | "MARKET" | "DISPUTE" | "GAS";
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedMinutes: number;
  description: string;
  href: string;
  codeSnippet: {
    solidity?: string;
    typescript?: string;
    curl?: string;
    rust?: string;
  };
}

export const mockCookbooks: CookbookCard[] = [
  {
    id: "compose-within",
    title: "Composing a WITHIN(48h) Event Assertion",
    category: "COMPOSITION",
    difficulty: "Beginner",
    estimatedMinutes: 5,
    description: "Chain two primitive event hashes into a single deterministic composite node evaluated by EventComposer.",
    href: "/docs/composition",
    codeSnippet: {
      solidity: `// SPDX-License-Identifier: MIT
pragma solity ^0.8.24;

import { IEventComposer } from "@novak/contracts/interfaces/IEventComposer.sol";
import { CompositeOp } from "@novak/contracts/types/OracleTypes.sol";

contract MarketComposer {
    IEventComposer public immutable composer;

    constructor(address _composer) {
        composer = IEventComposer(_composer);
    }

    function createWithinCondition(
        bytes32 eventA,
        bytes32 eventB
    ) external returns (bytes32 compositeId) {
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;

        // Create WITHIN assertion with a 48-hour time window (172800s)
        compositeId = composer.registerComposite(
            CompositeOp.Within,
            operands,
            172800
        );
    }
}`,
      typescript: `import { NovakClient, CompositeOp } from "@novak/sdk";

const client = new NovakClient({ provider });

// Register a WITHIN 48h composite event
const { compositeId, hash } = await client.composer.registerComposite({
  op: CompositeOp.Within,
  operandIds: [eventIdA, eventIdB],
  windowSeconds: 48 * 60 * 60,
});

console.log("Composite Event Registered:", compositeId);`,
      curl: `curl -X POST https://api.novak.network/v1/events/composite \\
  -H "Content-Type: application/json" \\
  -d '{
    "op": "WITHIN",
    "operandIds": ["0x1a2b...", "0x2b3c..."],
    "windowSeconds": 172800
  }'`,
    },
  },
  {
    id: "custom-resolver",
    title: "Building an Autonomous Resolver Adapter",
    category: "RESOLVER",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    description: "Submit validated real-world observations to BaseRegistry with cryptographic signatures and bond stakes.",
    href: "/docs/architecture",
    codeSnippet: {
      solidity: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IBaseRegistry } from "@novak/contracts/interfaces/IBaseRegistry.sol";

contract CustomOracleAdapter {
    IBaseRegistry public immutable registry;

    constructor(address _registry) {
        registry = IBaseRegistry(_registry);
    }

    function resolveEvent(bytes32 eventId, bool outcome) external {
        // Submit observation to BaseRegistry with required stake bond
        registry.observe{value: 0.1 ether}(eventId, outcome);
    }
}`,
      typescript: `import { NovakClient } from "@novak/sdk";

const client = new NovakClient({ walletClient });

// Submit observation for primitive event
const txHash = await client.registry.observe({
  eventId: "0x1a2b3c4d5e6f...",
  outcome: true,
  bondEth: "0.1",
});

await client.waitForFinality(txHash);`,
      curl: `curl -X POST https://api.novak.network/v1/registry/observe \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "eventId": "0x1a2b...",
    "outcome": true,
    "bond": "100000000000000000"
  }'`,
    },
  },
  {
    id: "settlement-hook",
    title: "Hooking Derivatives into EventBus Settlement",
    category: "MARKET",
    difficulty: "Advanced",
    estimatedMinutes: 12,
    description: "Read terminal finalized outcomes directly from EventBus with 0-gas oracle reads and instant parimutuel payout calculation.",
    href: "/docs/sdk",
    codeSnippet: {
      solidity: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventBus } from "@novak/contracts/interfaces/IEventBus.sol";

contract DerivativeSettlementHook {
    IEventBus public immutable eventBus;

    constructor(address _eventBus) {
        eventBus = IEventBus(_eventBus);
    }

    function settleMarket(bytes32 compositeId) external {
        (bool resolved, bool outcome) = eventBus.getFinalizedOutcome(compositeId);
        require(resolved, "EventBus: Not finalized");

        if (outcome) {
            // Distribute YES pool collateral
        } else {
            // Distribute NO pool collateral
        }
    }
}`,
      typescript: `import { NovakClient } from "@novak/sdk";

const client = new NovakClient({ publicClient });

// Read finalized outcome directly from EventBus
const outcome = await client.eventBus.getFinalizedOutcome("0x4d5e6f...");
if (outcome.isFinalized) {
  console.log("Terminal State:", outcome.result ? "TRUE" : "FALSE");
}`,
      curl: `curl https://api.novak.network/v1/eventbus/0x4d5e6f.../outcome`,
    },
  },
];

export function DocsCookbooks() {
  const [selectedCookbook, setSelectedCookbook] = useState<string>(mockCookbooks[0].id);
  const [activeLang, setActiveLang] = useState<"solidity" | "typescript" | "curl">("solidity");
  const [copied, setCopied] = useState(false);

  const currentCookbook = mockCookbooks.find((c) => c.id === selectedCookbook) ?? mockCookbooks[0];

  const copyCode = () => {
    const codeText = currentCookbook.codeSnippet[activeLang] || "";
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-12 flex flex-col gap-10 border-t border-gray-200 pt-10">
      {/* Section Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-gray-500 font-semibold mb-1">
          <BookOpen className="h-4 w-4 text-ink" />
          Developer Cookbooks &amp; Code Chunks
        </div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-ink">
          Interactive Integration Recipes
        </h2>
        <p className="mt-2 text-gray-600 max-w-2xl text-sm leading-relaxed">
          Production-ready code snippets and architecture recipes to build, compose, and settle oracle-backed smart contracts on Ethereum.
        </p>
      </div>

      {/* Interactive Code Snippet Box */}
      <div className="border border-gray-300 bg-paper rounded-sm overflow-hidden shadow-sm">
        {/* Cookbook Selector Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-100 p-3 border-b border-gray-300 font-mono text-xs">
          <div className="flex items-center gap-2">
            {mockCookbooks.map((cb) => (
              <button
                key={cb.id}
                onClick={() => setSelectedCookbook(cb.id)}
                className={`px-3 py-1.5 rounded-sm transition-colors font-semibold ${
                  selectedCookbook === cb.id
                    ? "bg-ink text-paper"
                    : "text-gray-600 hover:text-ink hover:bg-gray-200"
                }`}
              >
                {cb.category}
              </button>
            ))}
          </div>

          {/* Language Switcher Tabs */}
          <div className="flex items-center gap-2">
            {(["solidity", "typescript", "curl"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`px-2.5 py-1 rounded-sm uppercase tracking-wide transition-colors ${
                  activeLang === lang
                    ? "bg-paper text-ink border border-gray-300 font-bold"
                    : "text-gray-500 hover:text-ink"
                }`}
              >
                {lang}
              </button>
            ))}

            <button
              onClick={copyCode}
              className="flex items-center gap-1 border border-gray-300 bg-paper hover:bg-gray-50 px-2.5 py-1 text-ink rounded-sm transition-colors ml-2"
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-gray-600" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Description */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div>
            <span className="font-mono font-bold text-ink text-sm">{currentCookbook.title}</span>
            <p className="text-gray-600 mt-0.5">{currentCookbook.description}</p>
          </div>
          <div className="flex items-center gap-3 font-mono text-gray-500">
            <span>Difficulty: <strong className="text-ink">{currentCookbook.difficulty}</strong></span>
            <span>Est. Time: <strong className="text-ink">{currentCookbook.estimatedMinutes} mins</strong></span>
          </div>
        </div>

        {/* Code View */}
        <div className="p-5 bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed">
          <pre>
            <code>{currentCookbook.codeSnippet[activeLang] || "// Code snippet not available"}</code>
          </pre>
        </div>
      </div>

      {/* Light Protocol Style Chunk Cards Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/docs/architecture"
          className="group border border-gray-300 bg-paper p-5 rounded-sm shadow-sm hover:border-ink transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>01 / ARCHITECTURE</span>
            <Layers className="h-4 w-4 text-gray-400 group-hover:text-ink transition-colors" />
          </div>
          <h3 className="mt-3 font-semibold text-base text-ink group-hover:underline flex items-center justify-between">
            5-Layer Oracle Stack
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-ink transition-transform group-hover:translate-x-1" />
          </h3>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            From BaseRegistry down to EventBus — strict single-dependency hierarchy.
          </p>
        </Link>

        <Link
          href="/docs/disputes"
          className="group border border-gray-300 bg-paper p-5 rounded-sm shadow-sm hover:border-ink transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>02 / DISPUTE GUARD</span>
            <ShieldCheck className="h-4 w-4 text-gray-400 group-hover:text-ink transition-colors" />
          </div>
          <h3 className="mt-3 font-semibold text-base text-ink group-hover:underline flex items-center justify-between">
            Two-Tier Ladder Security
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-ink transition-transform group-hover:translate-x-1" />
          </h3>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            Bonded challenge ladder, committee voting windows, and VOID hard floor state.
          </p>
        </Link>

        <Link
          href="/docs/composition"
          className="group border border-gray-300 bg-paper p-5 rounded-sm shadow-sm hover:border-ink transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between text-xs font-mono text-gray-500 uppercase tracking-wide">
            <span>03 / LOGIC ENGINE</span>
            <GitBranch className="h-4 w-4 text-gray-400 group-hover:text-ink transition-colors" />
          </div>
          <h3 className="mt-3 font-semibold text-base text-ink group-hover:underline flex items-center justify-between">
            Deterministic Operators
            <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-ink transition-transform group-hover:translate-x-1" />
          </h3>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            AND, OR, NOT, BEFORE, and WITHIN(Δt) composite logic evaluation rules.
          </p>
        </Link>
      </div>
    </div>
  );
}
