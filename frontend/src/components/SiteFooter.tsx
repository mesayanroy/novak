import Link from "next/link";
import { novakAddresses } from "@/lib/addresses";
import { shortHex } from "@/lib/utils";

const footerColumns = [
  {
    heading: "Protocol",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/threat-model", label: "Threat model" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { href: "/docs/sdk", label: "SDK reference" },
      { href: "/docs/api", label: "Events API" },
      { href: "https://github.com/mesayanroy/novak", label: "GitHub" },
    ],
  },
  {
    heading: "Product",
    links: [{ href: "/markets", label: "Markets" }],
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
  const hasAnyAddress = contractRows.some((row) => row.address !== "0x");

  return (
    <footer className="border-t border-gray-200">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-lg font-semibold tracking-tight">Novak</p>
            <p className="mt-2 max-w-[24ch] text-sm text-gray-600">
              A decentralized, composable event bus for Ethereum.
            </p>
          </div>

          {footerColumns.map((col) => (
            <div key={col.heading}>
              <p className="font-mono text-xs uppercase tracking-wide text-gray-500">{col.heading}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="link-plain text-sm text-gray-700 hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Contracts</p>
            {hasAnyAddress ? (
              <>
                <p className="mt-3 text-xs text-gray-500">Local Anvil (chain 31337) — dev only</p>
                <ul className="mt-2 flex flex-col gap-1.5 font-mono text-xs text-gray-700">
                  {contractRows
                    .filter((row) => row.address !== "0x")
                    .map((row) => (
                      <li key={row.label} className="flex items-baseline justify-between gap-3">
                        <span className="text-gray-500">{row.label}</span>
                        <span>{shortHex(row.address)}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                No deployment configured yet — see{" "}
                <Link href="/docs/sdk" className="text-ink">
                  SDK reference
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <p className="mt-12 text-xs text-gray-500">
          Novak — Neural Event Network. This site describes the protocol as implemented and tested; see{" "}
          <Link href="/docs/threat-model" className="text-ink">
            the threat model
          </Link>{" "}
          for its stated limitations.
        </p>
      </div>
    </footer>
  );
}
