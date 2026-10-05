"use client";

import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Landmark, CheckCircle2, Scale, Coins } from "lucide-react";
import { AnimatedList } from "@/components/ui/animated-list";
import { AssetIcon } from "@/components/markets/AssetIcon";
import { fmtPrice, useLiveFeeds } from "@/lib/feeds";
import { cn } from "@/lib/utils";

interface Note {
  key: string;
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
  tone: "feed" | "rate" | "protocol";
}

const ago = (unix?: number | null) => {
  if (!unix) return "live";
  const s = Math.max(0, Date.now() / 1000 - unix);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
};

function Notification({ n }: { n: Note }) {
  return (
    <figure
      className={cn(
        "relative mx-auto w-full max-w-[420px] cursor-default overflow-hidden rounded-2xl bg-white p-3.5",
        "transition-transform duration-200 ease-out hover:scale-[1.02]",
        "[box-shadow:0_0_0_1px_rgba(124,58,237,.08),0_2px_4px_rgba(0,0,0,.04),0_12px_24px_rgba(109,74,255,.08)]",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-none">{n.icon}</div>
        <div className="min-w-0 flex-1">
          <figcaption className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="truncate">{n.title}</span>
            <span className="text-gray-300">·</span>
            <span className="flex-none text-xs font-normal text-gray-500">{n.meta}</span>
          </figcaption>
          <p className="truncate text-[13px] text-gray-600">{n.detail}</p>
        </div>
        <span
          className={cn(
            "flex-none rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase",
            n.tone === "feed" && "bg-violet-50 text-violet-700",
            n.tone === "rate" && "bg-sky-50 text-sky-700",
            n.tone === "protocol" && "bg-emerald-50 text-emerald-700",
          )}
        >
          {n.tone === "feed" ? "feed" : n.tone === "rate" ? "macro" : "novak"}
        </span>
      </div>
    </figure>
  );
}

const tile = (cls: string, node: ReactNode) => <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-white", cls)}>{node}</div>;

/** Live notifications: real Chainlink rounds and Fed data, interleaved with the protocol steps they feed. */
function useNotes(): Note[] {
  const { data: feeds } = useLiveFeeds();
  const { data: rates } = useQuery({
    queryKey: ["rates"],
    refetchInterval: 30 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/rates");
      return (await r.json()) as { target: { date: string; upper: number; lower: number } | null; effr: { date: string; rate: number } | null };
    },
  });

  return useMemo(() => {
    const row = (s: string) => feeds?.rows.find((r) => r.symbol === s);
    const feedNote = (sym: string, title: string, sub: string): Note => {
      const r = row(sym);
      return {
        key: sym,
        icon: <AssetIcon ticker={sym} size={40} />,
        title,
        detail: r?.price != null ? `${fmtPrice(r.price)} · ${sub}` : sub,
        meta: ago(r?.updatedAt),
        tone: "feed",
      };
    };
    const t = rates?.target;
    return [
      feedNote("NVDA", "NVDA round", "Chainlink, Robinhood Chain"),
      {
        key: "quorum",
        icon: tile("bg-gradient-to-br from-violet-600 to-indigo-500", <CheckCircle2 className="h-5 w-5" />),
        title: "Quorum reached",
        detail: "NVDA ≥ $234 at T → TRUE · 2 of 2 resolvers",
        meta: "registry",
        tone: "protocol",
      },
      feedNote("TSLA", "TSLA round", "Chainlink, 24/5"),
      {
        key: "fed",
        icon: tile("bg-gradient-to-br from-sky-600 to-blue-500", <Landmark className="h-5 w-5" />),
        title: "Fed target range",
        detail: t ? `${t.lower.toFixed(2)}–${t.upper.toFixed(2)}%${rates?.effr ? ` · EFFR ${rates.effr.rate.toFixed(2)}%` : ""}` : "FRED · NY Fed",
        meta: t ? t.date : "macro",
        tone: "rate",
      },
      feedNote("SGOV", "SGOV · tokenized Treasury", "T-bill ETF feed"),
      {
        key: "final",
        icon: tile("bg-gradient-to-br from-emerald-500 to-teal-500", <Scale className="h-5 w-5" />),
        title: "Finalized → EventBus",
        detail: "No dispute in the window · readable by every market",
        meta: "keeper",
        tone: "protocol",
      },
      feedNote("BTC", "BTC round", "crypto, 24/7"),
      {
        key: "settled",
        icon: tile("bg-gradient-to-br from-fuchsia-600 to-violet-500", <Coins className="h-5 w-5" />),
        title: "Range market settled",
        detail: "$234–$236 pays 1 USDG · fees split ⅓·⅓·⅓",
        meta: "testnet",
        tone: "protocol",
      },
      feedNote("ETH", "ETH round", "crypto, 24/7"),
    ];
  }, [feeds, rates]);
}

const Hl = ({ children }: { children: ReactNode }) => (
  <span className="rounded-md bg-violet-100/70 px-1 font-semibold text-violet-800">{children}</span>
);

export function LiveFactsFeed() {
  const notes = useNotes();
  // AnimatedList reveals its children one by one; repeat the cycle so it keeps streaming.
  const stream = useMemo(() => Array.from({ length: 6 }, (_, c) => notes.map((n) => ({ ...n, key: `${n.key}-${c}` }))).flat(), [notes]);

  return (
    <section className="relative overflow-hidden bg-white py-20">
      <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr_440px]">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.5 }}>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">Live, end to end</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">From a price tick to a settled market</h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-700">
            Every <Hl>Chainlink round</Hl> for tokenized stocks, the <Hl>SGOV tokenized Treasury</Hl> and crypto — plus the{" "}
            <Hl>Fed&apos;s target rate</Hl> — is a source Novak&apos;s resolvers can watch.
          </p>
          <ol className="mt-6 space-y-3 text-[15px] text-gray-700">
            {[
              ["Observe", "resolvers read the round in effect at T and post an evidence hash"],
              ["Agree", "identical answers reach quorum; a dispute window opens"],
              ["Finalize", "the fact lands on the EventBus — once, for everyone"],
              ["Settle", "markets pay out and fees reward the resolvers who were right"],
            ].map(([k, v], i) => (
              <motion.li
                key={k}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.12 }}
                className="flex gap-3"
              >
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-violet-600 font-mono text-[11px] font-bold text-white">{i + 1}</span>
                <span>
                  <strong className="text-ink">{k}</strong> — {v}.
                </span>
              </motion.li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-gray-500">Prices on the right are live from Robinhood Chain mainnet; protocol steps are from the testnet deployment.</p>
        </motion.div>

        <div className="relative h-[460px] overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-b from-violet-50/70 to-white p-3">
          <AnimatedList delay={1700} className="gap-2.5">
            {stream.map((n) => (
              <Notification key={n.key} n={n} />
            ))}
          </AnimatedList>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white" />
        </div>
      </div>
    </section>
  );
}
