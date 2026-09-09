import { EventStatus, type CompositeOp } from "@novak/sdk";
import { cn } from "@/lib/utils";

/**
 * Status is legible without color, by design (the whole palette is
 * black/white/gray) — every state below is a distinct
 * {fill, border style, glyph, label} combination, never a color code.
 * Composite events additionally carry a small "C" marker segment so a
 * composed event's pill never reads as a primitive one at a glance.
 */

type Glyph = "open" | "partial" | "proposed" | "dispute" | "check" | "cross" | "void" | "expired";

function Icon({ glyph, className }: { glyph: Glyph; className?: string }) {
  const common = { className: cn("h-3.5 w-3.5", className), viewBox: "0 0 16 16", fill: "none" };
  switch (glyph) {
    case "open":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.4 2.4" />
        </svg>
      );
    case "partial":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8H8V2.5Z" fill="currentColor" />
        </svg>
      );
    case "proposed":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        </svg>
      );
    case "dispute":
      return (
        <svg {...common}>
          <path d="M8 2v10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3 5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3 5 1.4 8.2a1.8 1.8 0 0 0 3.2 0L3 5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M13 5l-1.6 3.2a1.8 1.8 0 0 0 3.2 0L13 5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "void":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4.3 11.7 11.7 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "expired":
      return (
        <svg {...common}>
          <path d="M4.5 2.5h7M4.5 13.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path
            d="M5.5 2.5v2.2c0 1 .5 1.9 1.3 2.5l1.2.8-1.2.8c-.8.6-1.3 1.5-1.3 2.5v2.2M10.5 2.5v2.2c0 1-.5 1.9-1.3 2.5l-1.2.8 1.2.8c.8.6 1.3 1.5 1.3 2.5v2.2"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function PillShell({
  filled,
  dashed,
  isComposite,
  className,
  children,
}: {
  filled: boolean;
  dashed?: boolean;
  isComposite?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center overflow-hidden rounded-sm border text-xs font-mono uppercase tracking-wide",
        filled ? "border-ink bg-ink text-paper" : "border-ink bg-transparent text-ink",
        dashed && "border-dashed",
        className,
      )}
    >
      {isComposite && (
        <span
          className={cn(
            "border-r px-1.5 py-1 text-[10px] font-semibold",
            filled ? "border-paper/30" : "border-ink/40",
          )}
          title="Composite event"
        >
          C
        </span>
      )}
      <span className="flex items-center gap-1.5 px-2 py-1">{children}</span>
    </span>
  );
}

const EVENT_STATUS_MAP: Partial<Record<EventStatus, { glyph: Glyph; label: string; filled: boolean; dashed?: boolean }>> = {
  [EventStatus.Open]: { glyph: "open", label: "Open", filled: false, dashed: true },
  [EventStatus.ObservationsSubmitted]: { glyph: "partial", label: "Observing", filled: false },
  [EventStatus.ProposedOutcome]: { glyph: "proposed", label: "Proposed", filled: false },
  [EventStatus.Disputed]: { glyph: "dispute", label: "Disputed", filled: true },
  [EventStatus.Finalized]: { glyph: "check", label: "Finalized", filled: true },
  [EventStatus.Voided]: { glyph: "void", label: "Voided", filled: false },
  [EventStatus.Expired]: { glyph: "expired", label: "Expired", filled: false, dashed: true },
};

export function EventStatusPill({
  status,
  tier,
  isComposite,
  className,
}: {
  status: EventStatus;
  /** Only meaningful when status === Disputed. */
  tier?: 1 | 2;
  isComposite?: boolean;
  className?: string;
}) {
  const entry = EVENT_STATUS_MAP[status] ?? EVENT_STATUS_MAP[EventStatus.Open]!;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <PillShell filled={entry.filled} dashed={entry.dashed} isComposite={isComposite}>
        <Icon glyph={entry.glyph} />
        {entry.label}
      </PillShell>
      {status === EventStatus.Disputed && tier && (
        <span className="border border-ink px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink">
          Tier {tier}
        </span>
      )}
    </span>
  );
}

/** Composite-only resolution status (Unresolved/True/False/Voided) — see
 *  IEventComposer.Status. Distinct from EventStatusPill's 7 registry
 *  states; always carries the "C" composite marker. */
export function CompositeStatusPill({
  status,
  className,
}: {
  status: "Unresolved" | "True" | "False" | "Voided";
  className?: string;
}) {
  const map: Record<typeof status, { glyph: Glyph; label: string; filled: boolean; dashed?: boolean }> = {
    Unresolved: { glyph: "open", label: "Unresolved", filled: false, dashed: true },
    True: { glyph: "check", label: "True", filled: true },
    False: { glyph: "cross", label: "False", filled: false },
    Voided: { glyph: "void", label: "Voided", filled: false },
  };
  const entry = map[status];
  return (
    <PillShell filled={entry.filled} dashed={entry.dashed} isComposite className={className}>
      <Icon glyph={entry.glyph} />
      {entry.label}
    </PillShell>
  );
}

export function OperatorBadge({ op }: { op: CompositeOp | string }) {
  return (
    <span className="border border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-600">
      {op}
    </span>
  );
}
