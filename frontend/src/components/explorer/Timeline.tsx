"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { explorerUrl, type Hex } from "@novakoracle/sdk";
import { FileJson, Loader2 } from "lucide-react";
import { NOVAK_CHAIN_ID } from "@/lib/addresses";
import { RESOLVER_URL, useEvidence, type TimelineItem } from "@/lib/explorer";
import { fmtTime } from "@/lib/novak";
import { cn } from "@/lib/utils";

const TONE = {
  violet: "bg-violet-600 text-white shadow-violet-500/30",
  emerald: "bg-emerald-500 text-white shadow-emerald-500/30",
  rose: "bg-rose-500 text-white shadow-rose-500/30",
  amber: "bg-amber-500 text-white shadow-amber-500/30",
  gray: "bg-white text-gray-500 ring-1 ring-gray-200",
};

function Evidence({ hash }: { hash: Hex }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useEvidence(hash, open);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-mono text-[11px] text-violet-700 hover:border-violet-400"
      >
        <FileJson className="h-3.5 w-3.5" /> evidence {hash.slice(0, 10)}… {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {!RESOLVER_URL ? (
            <p className="p-3 text-xs text-gray-600">
              The evidence JSON is served by the resolver network (<code>/evidence/:hash</code>). Its hash is committed on-chain, so
              anyone can check the JSON they fetch against it.
            </p>
          ) : isLoading ? (
            <p className="flex items-center gap-2 p-3 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> fetching from the resolver network…
            </p>
          ) : error ? (
            <p className="p-3 text-xs text-rose-700">Resolver network unreachable right now ({(error as Error).message}).</p>
          ) : data === null ? (
            <p className="p-3 text-xs text-gray-600">This node restarted since the observation (evidence is kept in memory); the on-chain hash still commits to it.</p>
          ) : (
            <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-gray-800">{JSON.stringify(data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export function Timeline({ items, loading }: { items?: TimelineItem[]; loading?: boolean }) {
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-violet-50" />
        ))}
      </div>
    );
  }
  if (!items?.length) return <p className="text-sm text-gray-500">No on-chain activity found for this event yet.</p>;
  return (
    <ol className="relative border-l-2 border-violet-100 pl-7">
      {items.map((it, i) => (
        <motion.li
          key={`${it.tx}-${it.logIndex}`}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: Math.min(i, 8) * 0.04 }}
          className="relative pb-6 last:pb-0"
        >
          <span className={cn("absolute -left-[41px] flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-white font-mono text-[10px] font-bold shadow-md", TONE[it.tone])}>
            {i + 1}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold text-ink">{it.title}</p>
            <span className="font-mono text-[11px] text-gray-500">{it.time ? fmtTime(it.time) : `block ${it.block}`}</span>
          </div>
          {it.detail && <p className="mt-0.5 text-sm text-gray-600">{it.detail}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] text-gray-400">
            {explorer && (
              <a className="hover:text-violet-700" href={`${explorer}/tx/${it.tx}`} target="_blank" rel="noreferrer">
                tx {it.tx.slice(0, 10)}… ↗
              </a>
            )}
            {it.actor && explorer && (
              <a className="hover:text-violet-700" href={`${explorer}/address/${it.actor}`} target="_blank" rel="noreferrer">
                {it.actor.slice(0, 6)}…{it.actor.slice(-4)} ↗
              </a>
            )}
          </div>
          {it.evidenceHash && <Evidence hash={it.evidenceHash} />}
        </motion.li>
      ))}
    </ol>
  );
}
