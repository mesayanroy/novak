"use client";

import Link from "next/link";
import { NovakLogo } from "@/components/NovakLogo";
import { NOVAK_CHAIN_ID, deployment } from "@/lib/addresses";
import { useEventCounts, useMarkets } from "@/lib/novak";
import { useDistributionMarkets } from "@/lib/distribution";
import {
  Activity,
  Zap,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  BookOpen,
} from "lucide-react";

const footerColumns = [
  {
    heading: "Protocol Spec",
    links: [
      { href: "/docs", label: "Overview & Thesis" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/disputes", label: "Disputes & committees" },
      { href: "/docs/threat-model", label: "Threat Model" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { href: "/docs/sdk", label: "TypeScript SDK (@novakoracle/sdk)" },
      { href: "/build", label: "Builder console" },
      { href: "/docs/integrate", label: "Integrate your market" },
      { href: "/docs/composition", label: "Composition Engine" },
      { href: "https://github.com/mesayanroy/novak", label: "GitHub Repository" },
    ],
  },
  {
    heading: "Markets & Hub",
    links: [
      { href: "/markets", label: "Explore Markets" },
      { href: "/disputes", label: "Dispute Center" },
      { href: "/events", label: "Event explorer" },
      { href: "/network", label: "Resolver network" },
      { href: "/calendar", label: "Corporate-Action Calendar" },
      { href: "/guard", label: "Lending Guard Demo" },
    ],
  },
];

export function SiteFooter() {
  const counts = useEventCounts();
  const markets = useMarkets({ live: true });
  const dists = useDistributionMarkets({ live: true });
  const networkName = NOVAK_CHAIN_ID === 46630 ? "Robinhood Chain testnet" : NOVAK_CHAIN_ID === 31337 ? "Local anvil" : `Chain ${NOVAK_CHAIN_ID}`;


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
                <Zap className="h-3 w-3 text-ink" /> Events: <strong className="text-ink">{counts.data?.total ?? "…"}</strong>
              </span>
              <span>Decided: <strong className="text-ink">{counts.data?.decided ?? "…"}</strong></span>
              <span>Live markets: <strong className="text-ink">{markets.data && dists.data ? markets.data.length + dists.data.length : "…"}</strong></span>
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
                Built in the open
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
