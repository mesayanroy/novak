"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";
import { DocsHoverMenu } from "@/components/docs/DocsHoverMenu";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/docs", label: "Docs", hasDropdown: true },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/markets", label: "Markets" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [docsHovered, setDocsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDocsHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setDocsHovered(false);
    }, 150);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-paper/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="link-plain flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-ink text-[11px] font-mono text-paper">N</span>
            Novak
          </Link>

          <nav className="relative hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <div
                key={link.href}
                className="relative py-4"
                onMouseEnter={link.hasDropdown ? handleMouseEnter : undefined}
                onMouseLeave={link.hasDropdown ? handleMouseLeave : undefined}
              >
                <Link
                  href={link.href}
                  className="link-plain flex items-center gap-1 text-sm font-medium text-gray-700 transition-colors hover:text-ink"
                >
                  {link.label}
                  {link.hasDropdown && (
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 text-gray-400", docsHovered && "rotate-180 text-ink")} />
                  )}
                </Link>

                {link.hasDropdown && (
                  <DocsHoverMenu
                    isOpen={docsHovered}
                    onClose={() => setDocsHovered(false)}
                  />
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <button
            aria-label="Toggle menu"
            className="text-ink md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={cn("border-t border-gray-200 md:hidden", mobileOpen ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="link-plain rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-ink font-medium"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="px-2 py-2 sm:hidden">
            <ConnectButton />
          </div>
        </nav>
      </div>
    </header>
  );
}

