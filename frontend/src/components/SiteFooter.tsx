"use client";

import { useState } from "react";
import Link from "next/link";
import { NovakLogo } from "@/components/NovakLogo";
import { Availability, explorerUrl } from "@novak/sdk";
import { NOVAK_CHAIN_ID, deployment, novakAddresses } from "@/lib/addresses";
import { useEvents, useMarkets } from "@/lib/novak";
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
      { href: "/calendar", label: "Corporate-Action Calendar" },
      { href: "/guard", label: "Lending Guard Demo" },
    ],
  },
];

const contractRows: Array<{ label: string; address: string }> = [
  { label: "EventRegistry", address: novakAddresses.eventRegistry },
  { label: "DisputeManager", address: novakAddresses.disputeManager ?? "0x" },
  { label: "EventComposer", address: novakAddresses.eventComposer },
  { label: "EventBus", address: novakAddresses.eventBus },
  { label: "Market", address: novakAddresses.market },
  { label: "StockLendingGuard", address: novakAddresses.stockLendingGuard },
];

export function SiteFooter() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const events = useEvents();
  const markets = useMarkets();
  const explorer = explorerUrl(NOVAK_CHAIN_ID);
  const networkName = NOVAK_CHAIN_ID === 46630 ? "Robinhood Chain testnet" : NOVAK_CHAIN_ID === 31337 ? "Local anvil" : `Chain ${NOVAK_CHAIN_ID}`;
  const decided = (events.data ?? []).filter((e) => e.availability !== Availability.Pending).length;

  const hasAnyAddress = contractRows.some((row) => row.address !== "0x");

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };


  return (
    <footer className="border-t border-gray-200 bg-paper">
      {/* Live Protocol Status Bar */}
      <div className="border-b border-gray-200 bg-gray-50 py-3">
        <div className="mx-auto max-w-6xl px-6 flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${deployment ? "bg-emerald-500" : "bg-gray-400"}`} />
            <span className="font-semibold text-ink">Network:</span>
            <span>{networkName}{deployment ? "" : " — no deployment configured"}</span>
          </div>
          {deployment && (
            <div className="flex items-center gap-5 text-gray-500">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-ink" /> Events: <strong className="text-ink">{events.data?.length ?? "…"}</strong>
              </span>
              <span>Decided: <strong className="text-ink">{events.data ? decided : "…"}</strong></span>
              <span>Markets: <strong className="text-ink">{markets.data?.length ?? "…"}</strong></span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand & Newsletter Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="text-xl font-bold tracking-tight text-ink flex items-center gap-2.5">
              <NovakLogo className="h-6 w-6" />
              <span>Novak</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-gray-600 leading-relaxed">
              The event layer for tokenized stocks on Robinhood Chain. Chainlink prices the tokens; Novak finalizes what happens to them — resolved once, disputable, composable, and read by every protocol.
            </p>

            {/* Event Alert Newsletter Form */}
            <div className="mt-6 border border-gray-300 bg-paper p-3.5 rounded-sm">
              <p className="font-mono text-xs font-semibold text-ink uppercase tracking-wide">
                Open source · MIT
              </p>
              <a
                href="https://github.com/mesayanroy/novak"
                className="mt-2 inline-flex text-xs font-mono text-ink underline"
              >
                Follow development on GitHub →
              </a>
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
                {networkName} (chain ID {NOVAK_CHAIN_ID}){explorer ? " · verified on Blockscout" : ""}
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
                    {explorer ? (
                      <a
                        href={`${explorer}/address/${row.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] uppercase text-gray-500 font-semibold hover:text-ink"
                      >
                        {row.label} ↗
                      </a>
                    ) : (
                      <span className="text-[10px] uppercase text-gray-500 font-semibold">{row.label}</span>
                    )}
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
          <p>© 2026 Novak — Neural Event Network. Open-source event layer, built on Robinhood Chain (an Arbitrum L2 on Ethereum). Not affiliated with Robinhood.</p>
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
