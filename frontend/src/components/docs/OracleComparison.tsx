"use client";

import { motion } from "framer-motion";
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Side by side": what each oracle design gives a market. Lives in the docs (Architecture). */

type Cell = { v: "yes" | "no" | "na" | "note"; text: string };
const ROWS: { cap: string; price: Cell; optimistic: Cell; novak: Cell }[] = [
  { cap: "Live prices", price: { v: "yes", text: "its core job" }, optimistic: { v: "na", text: "not designed for it" }, novak: { v: "note", text: "reads Chainlink as a source" } },
  { cap: "Corporate actions & halts as facts", price: { v: "no", text: "not provided" }, optimistic: { v: "yes", text: "any question, in prose" }, novak: { v: "yes", text: "machine-checkable specs" } },
  { cap: "Compose AND / OR / BEFORE / WITHIN on-chain", price: { v: "no", text: "—" }, optimistic: { v: "no", text: "—" }, novak: { v: "yes", text: "canonical composite IDs" } },
  { cap: "Hard disputes decided by", price: { v: "na", text: "n/a" }, optimistic: { v: "note", text: "token-holder vote" }, novak: { v: "yes", text: "bonded resolver committees" } },
  { cap: "When nobody can agree", price: { v: "na", text: "n/a" }, optimistic: { v: "no", text: "the vote still picks" }, novak: { v: "yes", text: "VOID → refunds" } },
  { cap: "Fees reward whoever was right", price: { v: "na", text: "—" }, optimistic: { v: "note", text: "bonds and voter rewards" }, novak: { v: "yes", text: "TreasuryVault ⅓·⅓·⅓" } },
];

function Mark({ c }: { c: Cell }) {
  const icon = c.v === "yes" ? <Check className="h-3.5 w-3.5" /> : c.v === "no" ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />;
  return (
    <span className="flex items-start gap-2">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full",
          c.v === "yes" && "bg-emerald-100 text-emerald-700",
          c.v === "no" && "bg-rose-100 text-rose-600",
          (c.v === "na" || c.v === "note") && "bg-gray-100 text-gray-500",
        )}
      >
        {icon}
      </span>
      <span className="text-[13px] text-gray-700">{c.text}</span>
    </span>
  );
}

export function OracleComparison() {
  return (
    <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_12px_36px_-26px_rgba(109,74,255,0.6)]">
      <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr] gap-4 border-b border-violet-100 bg-violet-50/60 px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-600 md:grid">
        <span />
        <span>Price oracle</span>
        <span>Optimistic + token vote</span>
        <span className="text-violet-700">Novak</span>
      </div>
      {ROWS.map((r, i) => (
        <motion.div
          key={r.cap}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
          className="grid gap-2 border-b border-gray-100 px-5 py-4 last:border-0 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:gap-4"
        >
          <span className="text-sm font-semibold text-ink">{r.cap}</span>
          <span className="font-mono text-[10px] uppercase text-gray-400 md:hidden">Price oracle</span>
          <Mark c={r.price} />
          <span className="font-mono text-[10px] uppercase text-gray-400 md:hidden">Optimistic + token vote</span>
          <Mark c={r.optimistic} />
          <span className="font-mono text-[10px] uppercase text-violet-500 md:hidden">Novak</span>
          <div className="rounded-lg md:-mx-2 md:-my-1 md:bg-violet-50/70 md:px-2 md:py-1">
            <Mark c={r.novak} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
