"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const docsNavGroups: { label: string; items: { href: string; label: string; isNew?: boolean }[] }[] = [
  {
    label: "Start here",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/robinhood", label: "Robinhood Chain" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/oracle-architecture", label: "Oracle architecture", isNew: true },
      { href: "/docs/contracts", label: "Deployed contracts", isNew: true },
    ],
  },
  {
    label: "Protocol",
    items: [
      { href: "/docs/lifecycle", label: "Event lifecycle" },
      { href: "/docs/resolvers", label: "Resolver network", isNew: true },
      { href: "/docs/disputes", label: "Disputes & committees" },
      { href: "/docs/treasury", label: "Treasury & fee thirds", isNew: true },
      { href: "/docs/composition", label: "Composition" },
    ],
  },
  {
    label: "Markets",
    items: [
      { href: "/docs/distribution-markets", label: "Range markets (LMSR)", isNew: true },
      { href: "/docs/integrate", label: "Integrate your market" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/docs/sdk", label: "SDK reference" },
      { href: "/docs/api", label: "Contract API reference" },
      { href: "/docs/threat-model", label: "Threat model" },
      { href: "/docs/faq", label: "FAQ" },
    ],
  },
];

export const docsNav = docsNavGroups.flatMap((g) => g.items);

export function DocsSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {docsNavGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "link-plain flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-violet-600 font-medium text-white shadow-sm" : "text-gray-700 hover:bg-violet-50 hover:text-violet-800",
                  )}
                >
                  {item.label}
                  {item.isNew && !active && (
                    <span className="rounded-full bg-violet-100 px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-violet-700">new</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
