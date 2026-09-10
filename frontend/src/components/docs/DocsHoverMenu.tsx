"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ShieldCheck, Layers, GitMerge, FileCode2, Scale, Terminal, BookOpen, HelpCircle } from "lucide-react";

export interface DocsGridItem {
  index: string;
  href: string;
  title: string;
  tag: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const docsGridItems: DocsGridItem[] = [
  {
    index: "01",
    href: "/docs",
    title: "Protocol Overview",
    tag: "INTRO",
    description: "Core architecture, composable event bus thesis, and primary concepts.",
    icon: BookOpen,
  },
  {
    index: "02",
    href: "/docs/architecture",
    title: "5-Layer Architecture",
    tag: "STACK",
    description: "Strict layer dependencies from EventBus down to BaseRegistry.",
    icon: Layers,
  },
  {
    index: "03",
    href: "/docs/lifecycle",
    title: "Event Lifecycle",
    tag: "STATES",
    description: "Create → Observe → Disputed (T1/T2) → Finalized / Voided.",
    icon: GitMerge,
  },
  {
    index: "04",
    href: "/docs/composition",
    title: "Composition Engine",
    tag: "LOGIC",
    description: "AND, OR, NOT, BEFORE, and WITHIN(Δt) composite operators.",
    icon: FileCode2,
  },
  {
    index: "05",
    href: "/docs/disputes",
    title: "Disputes & Finalization",
    tag: "SECURITY",
    description: "Bond accounting, committee sizes, voting windows & VOID floor.",
    icon: Scale,
  },
  {
    index: "06",
    href: "/docs/api",
    title: "Events API Reference",
    tag: "REST",
    description: "On-chain read endpoints, parameter schemas, and curl examples.",
    icon: Terminal,
  },
  {
    index: "07",
    href: "/docs/sdk",
    title: "TypeScript SDK",
    tag: "NPM",
    description: "@novak/sdk package methods, client instantiation, and types.",
    icon: FileCode2,
  },
  {
    index: "08",
    href: "/docs/threat-model",
    title: "Threat Model",
    tag: "SAFETY",
    description: "DAG cycle-impossibility proof & terminal state propagation.",
    icon: ShieldCheck,
  },
  {
    index: "09",
    href: "/docs/faq",
    title: "Protocol FAQ",
    tag: "HELP",
    description: "Caveats, design trade-offs, and common questions answered.",
    icon: HelpCircle,
  },
];

interface DocsHoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocsHoverMenu({ isOpen, onClose }: DocsHoverMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.99 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-1/2 top-full z-50 mt-2 w-[780px] -translate-x-1/2 rounded-md border border-gray-300 bg-paper/98 p-5 shadow-xl backdrop-blur-md"
          onMouseLeave={onClose}
        >
          {/* Header Bar of Table Grid Popup */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ink animate-pulse-subtle" />
              <span className="font-mono text-xs uppercase tracking-wider text-ink font-semibold">
                Novak Specification Matrix &amp; Docs
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-gray-500">
              <span className="border border-gray-300 px-1.5 py-0.5 rounded-sm">
                SPEC v1.0.0
              </span>
              <span>9 SPEC MODULES</span>
            </div>
          </div>

          {/* Clean 3x3 Table Grid Layout */}
          <div className="mt-3 grid grid-cols-3 gap-px bg-gray-200 border border-gray-200 overflow-hidden rounded-sm">
            {docsGridItems.map((item) => {
              const IconComp = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="group relative flex flex-col justify-between bg-paper p-3.5 transition-colors duration-150 hover:bg-gray-100/90"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase font-semibold text-gray-400 group-hover:text-ink">
                        {item.index} / {item.tag}
                      </span>
                      <IconComp className="h-3.5 w-3.5 text-gray-400 transition-colors group-hover:text-ink" />
                    </div>

                    <h4 className="mt-1.5 font-medium text-sm text-ink group-hover:underline flex items-center gap-1">
                      {item.title}
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 text-gray-500" />
                    </h4>

                    <p className="mt-1 text-[11px] leading-relaxed text-gray-600 line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] font-mono text-gray-400 group-hover:border-gray-200">
                    <span>view spec →</span>
                    <span className="opacity-0 group-hover:opacity-100 text-ink">READ</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer Quick Bar */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500 font-mono pt-2 border-t border-gray-100">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-ink">Oracle Standard:</span> Composable Cryptographic Fact Verification
            </span>
            <Link href="/markets" onClick={onClose} className="link-plain text-ink hover:underline font-semibold">
              Explore Live Markets →
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
