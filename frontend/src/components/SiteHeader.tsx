"use client";

import Link from "next/link";
import { NovakLogo } from "@/components/NovakLogo";
import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";
import { DocsHoverMenu } from "@/components/docs/DocsHoverMenu";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; hasDropdown?: boolean };

/** Primary flow first (trade → challenge → inspect → operate → build), then Docs and the data pages. */
const navLinks: NavLink[] = [
  { href: "/markets", label: "Markets" },
  { href: "/disputes", label: "Disputes" },
  { href: "/events", label: "Events" },
  { href: "/build", label: "Build" },
  { href: "/docs", label: "Docs", hasDropdown: true },
];
const dataLinks: NavLink[] = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/network", label: "Resolver network" },
  { href: "/feeds", label: "Live feeds" },
  { href: "/calendar", label: "Corporate actions" },
  { href: "/guard", label: "Lending guard" },
  { href: "/docs/sdk", label: "SDK reference" },
  { href: "/start", label: "Get started" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [docsHovered, setDocsHovered] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/docs" ? pathname === "/docs" || (pathname.startsWith("/docs/") && pathname !== "/docs/sdk") : pathname === href || pathname.startsWith(`${href}/`));
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
          <Link href="/" className="link-plain flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <NovakLogo className="h-7 w-7" />
            <span>Novak</span>
          </Link>

          <nav className="relative hidden items-center gap-5 lg:flex">
            {navLinks.map((link) => (
              <div
                key={link.href}
                className="relative py-4"
                onMouseEnter={link.hasDropdown ? handleMouseEnter : undefined}
                onMouseLeave={link.hasDropdown ? handleMouseLeave : undefined}
              >
                <Link
                  href={link.href}
                  className={cn(
                    "link-plain flex items-center gap-1 text-sm font-medium transition-colors hover:text-violet-700",
                    isActive(link.href) ? "text-violet-700" : "text-gray-700",
                  )}
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
            <div className="relative py-4" onMouseEnter={() => setDataOpen(true)} onMouseLeave={() => setDataOpen(false)}>
              <button
                type="button"
                onClick={() => setDataOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1 text-sm font-medium transition-colors hover:text-violet-700",
                  dataLinks.some((l) => isActive(l.href)) ? "text-violet-700" : "text-gray-700",
                )}
              >
                More <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", dataOpen && "rotate-180")} />
              </button>
              {dataOpen && (
                <div className="absolute left-1/2 top-full z-50 w-52 -translate-x-1/2 rounded-xl border border-violet-100 bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(109,74,255,0.5)]">
                  {dataLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setDataOpen(false)}
                      className={cn("link-plain block rounded-lg px-3 py-2 text-sm hover:bg-violet-50 hover:text-violet-800", isActive(l.href) ? "text-violet-700" : "text-gray-700")}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <button
            aria-label="Toggle menu"
            className="text-ink lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={cn("border-t border-gray-200 lg:hidden", mobileOpen ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
          {[...navLinks, ...dataLinks].map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "link-plain rounded-lg px-2 py-2 text-sm font-medium hover:bg-violet-50 hover:text-violet-800",
                isActive(link.href) ? "text-violet-700" : "text-gray-700",
                i === navLinks.length && "mt-2 border-t border-gray-100 pt-3",
              )}
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

