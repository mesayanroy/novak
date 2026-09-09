import { cn } from "@/lib/utils";

/**
 * Visible marker for any mocked section — per the mock-data policy, a demo
 * market/event must never be mistakable for a real one. Pair with a
 * `// TODO: wire to <contract or endpoint>` comment at the integration seam.
 */
export function ExampleDataBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-dashed border-gray-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-600",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
        <path d="M8 1.5 14.5 13H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 6.2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.7" fill="currentColor" />
      </svg>
      Example data
    </span>
  );
}
