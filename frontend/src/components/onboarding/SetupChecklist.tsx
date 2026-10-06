"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { TESTNET_FAUCET_URL } from "@novakoracle/sdk";
import { ArrowRight, Check, ChevronDown, Copy, Droplets, ExternalLink, Network, PartyPopper, Plug, Puzzle, ShoppingCart, Wallet, X } from "lucide-react";
import { deployment } from "@/lib/addresses";
import { activeChain } from "@/lib/wagmi";
import { useSetupProgress, type StepId } from "@/lib/setup";
import { fmtUsdg, useNovakClient } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { ConnectButton } from "@/components/ConnectButton";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "novak.setup.dismissed";

const META: Record<StepId, { title: string; body: string; icon: React.ComponentType<{ className?: string }> }> = {
  wallet: { title: "Install MetaMask", body: "The browser wallet you'll trade and dispute with.", icon: Puzzle },
  connect: { title: "Connect your wallet", body: "Novak never holds your keys — every action is a transaction you sign.", icon: Plug },
  network: { title: "Switch to Robinhood Chain testnet", body: "Chain 46630. MetaMask adds it for you in one click.", icon: Network },
  gas: { title: "Get testnet ETH", body: "Free from the Robinhood Chain faucet — pays gas and dispute bonds.", icon: Droplets },
  usdg: { title: "Mint test USDG", body: "The markets' collateral. Test money with no value, free to mint.", icon: Wallet },
  trade: { title: "Make your first trade", body: "Pick a range or yes/no market and take a position.", icon: ShoppingCart },
};
const ORDER: StepId[] = ["wallet", "connect", "network", "gas", "usdg", "trade"];

function Action({ id }: { id: StepId }) {
  const { address } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const client = useNovakClient();
  const { run, pending, error } = useTx();
  const [copied, setCopied] = useState(false);
  const btn = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

  switch (id) {
    case "wallet":
      return (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className={cn(btn, "link-plain bg-violet-600 text-white hover:bg-violet-700")}>
          Install MetaMask <ExternalLink className="h-3.5 w-3.5" />
        </a>
      );
    case "connect":
      return <ConnectButton />;
    case "network":
      return (
        <button type="button" disabled={isPending} onClick={() => switchChain({ chainId: activeChain.id })} className={cn(btn, "bg-violet-600 text-white hover:bg-violet-700")}>
          {isPending ? "Check MetaMask…" : "Switch network"}
        </button>
      );
    case "gas":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <a href={TESTNET_FAUCET_URL} target="_blank" rel="noreferrer" className={cn(btn, "link-plain bg-violet-600 text-white hover:bg-violet-700")}>
            Open faucet <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {address && (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              className={cn(btn, "border border-violet-200 bg-white text-violet-700 hover:border-violet-400")}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy my address"}
            </button>
          )}
          <span className="text-[11px] text-gray-500">This checks your balance every 10 s.</span>
        </div>
      );
    case "usdg":
      return deployment?.collateralIsMock ? (
        <div>
          <button
            type="button"
            disabled={!client || !address || Boolean(pending)}
            onClick={() => run("Minting", async (wait) => wait(await client!.mintTestCollateral(address!, 1_000_000_000n, address!)))}
            className={cn(btn, "bg-violet-600 text-white hover:bg-violet-700")}
          >
            {pending ? `${pending}…` : "Mint 1,000 USDG"}
          </button>
          {error && <p className="mt-1 font-mono text-[11px] text-rose-700">{error}</p>}
        </div>
      ) : null;
    case "trade":
      return (
        <Link href="/markets" className={cn(btn, "link-plain bg-violet-600 text-white hover:bg-violet-700")}>
          Pick a market <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      );
  }
}

export function SetupChecklist({ variant = "page" }: { variant?: "page" | "compact" }) {
  const s = useSetupProgress();
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  if (variant === "compact" && (dismissed || s.complete || !s.ready)) return null;
  const pct = Math.round((s.done / s.total) * 100);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-violet-100 bg-white",
        variant === "page" ? "p-6 shadow-[0_24px_70px_-40px_rgba(109,74,255,0.7)] sm:p-8" : "p-5 shadow-[0_14px_40px_-30px_rgba(109,74,255,0.7)]",
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-200/40 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* progress ring */}
          <div className="relative h-14 w-14 flex-none">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#ede9fe" strokeWidth="3.5" />
              <motion.circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={97.4}
                initial={{ strokeDashoffset: 97.4 }}
                animate={{ strokeDashoffset: 97.4 * (1 - s.done / s.total) }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-violet-700">{pct}%</span>
          </div>
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-600">Get started</p>
            <p className={cn("font-semibold text-ink", variant === "page" ? "text-xl" : "text-base")}>
              {s.complete ? "You're all set." : `Set up in about two minutes — ${s.done} of ${s.total} done`}
            </p>
          </div>
        </div>
        {variant === "compact" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full p-2 text-gray-500 hover:bg-violet-50" aria-label="Toggle checklist">
              <ChevronDown className={cn("h-4 w-4 transition", !open && "-rotate-90")} />
            </button>
            <button type="button" onClick={dismiss} className="rounded-full p-2 text-gray-400 hover:bg-violet-50" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative mt-5 grid gap-2"
          >
            {ORDER.map((id, i) => {
              const done = s.steps[id];
              const next = s.next === id;
              const M = META[id];
              return (
                <li
                  key={id}
                  className={cn(
                    "rounded-2xl border px-4 py-3 transition",
                    next ? "border-violet-300 bg-violet-50/60 shadow-[0_8px_24px_-18px_rgba(109,74,255,0.8)]" : "border-gray-100 bg-white",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full",
                        done ? "bg-emerald-500 text-white" : next ? "bg-violet-600 text-white shadow-[0_0_0_4px_rgba(124,58,237,0.15)]" : "bg-gray-100 text-gray-400",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : <M.icon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-semibold", done ? "text-gray-500 line-through decoration-gray-300" : "text-ink")}>
                        <span className="mr-1.5 font-mono text-[11px] text-gray-400">{i + 1}</span>
                        {M.title}
                      </p>
                      {!done && <p className="mt-0.5 text-sm text-gray-600">{M.body}</p>}
                      {done && id === "gas" && s.ethBalance !== undefined && (
                        <p className="text-xs text-gray-500">{Number(formatEther(s.ethBalance)).toFixed(4)} ETH</p>
                      )}
                      {done && id === "usdg" && s.usdgBalance !== undefined && <p className="text-xs text-gray-500">{fmtUsdg(s.usdgBalance)} USDG</p>}
                      {!done && next && (
                        <div className="mt-3">
                          <Action id={id} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>

      {s.complete && (
        <div className="relative mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white">
          <PartyPopper className="h-5 w-5" />
          <p className="flex-1 text-sm">Every outcome you trade on is resolved by Novak&apos;s dispute layer — and you can challenge any of them.</p>
          <Link href="/disputes" className="link-plain rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-violet-700">
            Open the Dispute Center
          </Link>
        </div>
      )}
    </section>
  );
}

/** Small header pill: "Setup 3/6" until the checklist is complete. */
export function SetupPill() {
  const s = useSetupProgress();
  if (!s.ready || s.complete) return null;
  return (
    <Link
      href="/start"
      className="link-plain hidden items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-mono text-[11px] font-semibold text-violet-700 hover:border-violet-400 sm:inline-flex"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-600" />
      Setup {s.done}/{s.total}
    </Link>
  );
}
