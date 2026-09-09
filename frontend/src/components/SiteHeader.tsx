"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/markets", label: "Markets" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="link-plain text-lg font-semibold tracking-tight">
          Novak
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="link-plain text-sm text-gray-700 hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>

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
              className="link-plain rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-ink"
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
