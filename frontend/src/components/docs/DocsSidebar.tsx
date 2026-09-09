"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const docsNav = [
  { href: "/docs", label: "Introduction" },
  { href: "/docs/architecture", label: "Architecture" },
  { href: "/docs/lifecycle", label: "Event lifecycle" },
  { href: "/docs/composition", label: "Composition" },
  { href: "/docs/disputes", label: "Dispute & finalization" },
  { href: "/docs/api", label: "Events API reference" },
  { href: "/docs/sdk", label: "SDK reference" },
  { href: "/docs/threat-model", label: "Threat model" },
  { href: "/docs/faq", label: "FAQ" },
];

export function DocsSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {docsNav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "link-plain rounded px-3 py-1.5 text-sm transition-colors",
              active ? "bg-ink text-paper" : "text-gray-700 hover:bg-gray-100 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
