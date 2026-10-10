"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ShieldCheck, Layers, GitMerge, FileCode2, Scale, Terminal, BookOpen, Cpu, Coins, BarChart3, Plug, MapPin } from "lucide-react";

export interface DocsGridItem {
  index: string;
  href: string;
  title: string;
  tag: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const docsGridItems: DocsGridItem[] = [
  { index: "01", href: "/docs", title: "Introduction", tag: "START", description: "What Novak is: the event & dispute layer for tokenized stocks on Robinhood Chain.", icon: BookOpen },
  { index: "02", href: "/docs/architecture", title: "Architecture", tag: "STACK", description: "Mainnet sources → resolvers → testnet contracts, and the one rule consumers follow.", icon: Layers },
  { index: "03", href: "/docs/oracle-architecture", title: "Oracle architecture", tag: "DESIGN", description: "How an answer is decided and defended: quorum, bonded committees, VOID.", icon: ShieldCheck },
  { index: "04", href: "/docs/contracts", title: "Deployed contracts", tag: "TESTNET", description: "Every live address on Robinhood Chain testnet (46630), verified on Blockscout.", icon: MapPin },
  { index: "05", href: "/docs/lifecycle", title: "Event lifecycle", tag: "STATES", description: "Create → observe → propose → dispute → finalized / voided / expired.", icon: GitMerge },
  { index: "06", href: "/docs/resolvers", title: "Resolver network", tag: "NODES", description: "Adapters, quorum, evidence, keeper, committee voting and rewards.", icon: Cpu },
  { index: "07", href: "/docs/disputes", title: "Disputes & committees", tag: "SECURITY", description: "Bonded Tier-1 (≤7) / Tier-2 (≤15) committees, 66% rule, VOID floor.", icon: Scale },
  { index: "08", href: "/docs/treasury", title: "Treasury & fee thirds", tag: "VALUE", description: "Every fee split ⅓ resolvers · ⅓ committee/insurance · ⅓ treasury.", icon: Coins },
  { index: "09", href: "/docs/distribution-markets", title: "Range markets", tag: "LMSR", description: "Where will NVDA close? N ranges, prices sum to 1, settled by threshold events.", icon: BarChart3 },
  { index: "10", href: "/docs/integrate", title: "Integrate your market", tag: "BUILD", description: "Settle your own prediction market on Novak events via the Bus or SDK.", icon: Plug },
  { index: "11", href: "/docs/sdk", title: "TypeScript SDK", tag: "SDK", description: "@novakoracle/sdk: client methods, spec encoders, feed catalog, ladders.", icon: FileCode2 },
  { index: "12", href: "/docs/api", title: "Contract API", tag: "ABI", description: "On-chain read/write surface with real function signatures.", icon: Terminal },
  { index: "13", href: "/docs/threat-model", title: "Threat model & FAQ", tag: "SAFETY", description: "Adversaries, known limitations, and honest answers.", icon: ShieldCheck },
];

interface DocsHoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Two rows show at once (6 modules); the rest scroll inside the panel. */
const ROW_H = 132;

export function DocsHoverMenu({ isOpen, onClose }: DocsHoverMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          // x: -50% here, not a translate class — framer owns this element's transform.
          initial={{ opacity: 0, x: "-50%", y: 8, scale: 0.99 }}
          animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
          exit={{ opacity: 0, x: "-50%", y: 6, scale: 0.99 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-1/2 top-full z-50 mt-2 w-[780px] rounded-2xl border border-white/60 bg-white/85 p-4 shadow-[0_24px_60px_-24px_rgba(76,29,149,0.45)] ring-1 ring-violet-100/70 backdrop-blur-xl backdrop-saturate-150"
          onMouseLeave={onClose}
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-violet-600" />
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink">Novak docs</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-gray-500">
              <span className="rounded-full border border-violet-200 bg-white/60 px-2 py-0.5 text-violet-700">v2 · testnet</span>
              <span>{docsGridItems.length} modules · scroll ↓</span>
            </div>
          </div>

          <div className="menu-scroll overflow-y-auto overscroll-contain rounded-xl pr-1.5" style={{ maxHeight: ROW_H * 2 + 8 }}>
            <div className="grid grid-cols-3 gap-2">
              {docsGridItems.map((item) => {
                const IconComp = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    style={{ height: ROW_H }}
                    className="link-plain group relative flex flex-col justify-between rounded-xl border border-violet-100/60 bg-white/70 p-3.5 transition-colors duration-150 hover:border-violet-200 hover:bg-white/90"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase text-gray-400 group-hover:text-violet-600">
                          {item.index} / {item.tag}
                        </span>
                        <IconComp className="h-3.5 w-3.5 text-gray-400 transition-colors group-hover:text-violet-600" />
                      </div>
                      <h4 className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-ink group-hover:text-violet-800">
                        {item.title}
                        <ArrowUpRight className="h-3 w-3 text-violet-500 opacity-0 transition-opacity group-hover:opacity-100" />
                      </h4>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-600">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-violet-100/70 px-1 pt-2.5 font-mono text-[11px] text-gray-500">
            <span>Event oracle &amp; dispute layer for Robinhood Chain</span>
            <Link href="/markets" onClick={onClose} className="link-plain font-semibold text-violet-700 hover:underline">
              Explore live markets →
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
