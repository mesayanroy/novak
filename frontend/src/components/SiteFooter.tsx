"use client";

import { useState } from "react";
import Link from "next/link";
import { novakAddresses } from "@/lib/addresses";
import { shortHex } from "@/lib/utils";
import {
  Activity,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  BookOpen,
} from "lucide-react";

const footerColumns = [
  {
    heading: "Protocol Spec",
    links: [
      { href: "/docs", label: "Overview & Thesis" },
      { href: "/docs/architecture", label: "5-Layer Stack" },
      { href: "/docs/disputes", label: "Dispute Guard (T1/T2)" },
      { href: "/docs/threat-model", label: "Threat Model" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { href: "/docs/sdk", label: "TypeScript SDK (@novak/sdk)" },
      { href: "/docs/api", label: "Events REST API" },
      { href: "/docs/composition", label: "Composition Engine" },
      { href: "https://github.com/mesayanroy/novak", label: "GitHub Repository" },
    ],
  },
  {
    heading: "Markets & Hub",
    links: [
      { href: "/markets", label: "Explore Markets" },
      { href: "/markets", label: "Event Feed Monitor" },
      { href: "/markets", label: "Create Market" },
    ],
  },
];

const contractRows: Array<{ label: string; address: string }> = [
  { label: "EventRegistry", address: novakAddresses.eventRegistry },
  { label: "DisputeManager", address: novakAddresses.disputeManager ?? "0x" },
  { label: "EventComposer", address: novakAddresses.eventComposer },
  { label: "EventBus", address: novakAddresses.eventBus },
  { label: "Market", address: novakAddresses.market },
];

export function SiteFooter() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const hasAnyAddress = contractRows.some((row) => row.address !== "0x");

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="border-t border-gray-200 bg-paper">
      {/* Live Protocol Status Bar */}
      <div className="border-b border-gray-200 bg-gray-50 py-3">
        <div className="mx-auto max-w-6xl px-6 flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-ink">Oracle Status:</span>
            <span>All 5 Layers Nominal (12ms latency)</span>
          </div>
          <div className="flex items-center gap-5 text-gray-500">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-ink" /> Gas: <strong className="text-ink">12 Gwei</strong>
            </span>
            <span>Active Disputes: <strong className="text-ink">0</strong></span>
            <span>Finalized Events: <strong className="text-ink">1,482</strong></span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand & Newsletter Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
              <span className="h-3 w-3 bg-ink rounded-sm" /> Novak
            </Link>
            <p className="mt-3 max-w-sm text-sm text-gray-600 leading-relaxed">
              Neural Event Network — A decentralized, composable event bus for Ethereum. Events resolved once, composed deterministically, and read by many.
            </p>

            {/* Event Alert Newsletter Form */}
            <div className="mt-6 border border-gray-300 bg-paper p-3.5 rounded-sm">
              <p className="font-mono text-xs font-semibold text-ink uppercase tracking-wide">
                Protocol Updates &amp; Event Feed Alerts
              </p>
              {subscribed ? (
                <div className="mt-2 text-xs font-mono text-emerald-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Subscribed to EventBus updates!
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="mt-2 flex items-center gap-2">
                  <input
                    type="email"
                    required
                    placeholder="dev@ethereum.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-1.5 text-xs font-mono rounded-sm text-ink focus:outline-none focus:border-ink"
                  />
                  <button
                    type="submit"
                    className="link-plain border border-ink bg-ink text-paper px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider rounded-sm hover:bg-gray-800 transition-colors shrink-0"
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Navigation Link Columns */}
          {footerColumns.map((col) => (
            <div key={col.heading}>
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                {col.heading}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="link-plain text-sm text-gray-700 hover:text-ink transition-colors flex items-center gap-1"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contract Address Section */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                Core Protocol Contract Deployments
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Deterministic addresses on Local Anvil (Chain ID 31337)
              </p>
            </div>
            <Link href="/docs/sdk" className="link-plain font-mono text-xs text-ink underline font-semibold">
              View SDK Docs →
            </Link>
          </div>

          {hasAnyAddress && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 font-mono text-xs">
              {contractRows
                .filter((row) => row.address !== "0x")
                .map((row) => (
                  <div
                    key={row.label}
                    className="border border-gray-200 bg-gray-50 p-2.5 rounded-sm flex flex-col justify-between"
                  >
                    <span className="text-[10px] uppercase text-gray-500 font-semibold">{row.label}</span>
                    <div className="mt-1 flex items-center justify-between text-ink font-bold">
                      <span>{shortHex(row.address, 6, 4)}</span>
                      <button
                        onClick={() => handleCopy(row.address)}
                        className="text-gray-400 hover:text-ink transition-colors"
                        title="Copy address"
                      >
                        {copiedAddress === row.address ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Bottom Legal & Copyright */}
        <div className="mt-10 pt-6 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500 font-mono">
          <p>© 2026 Novak Protocol — Neural Event Network. Open-source Ethereum Oracle Primitive.</p>
          <div className="flex items-center gap-4">
            <Link href="/docs/threat-model" className="hover:text-ink">
              Threat Model &amp; Security Assumptions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
