import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the docs pages, so every page has the same
 * look: ink-on-paper text, mono eyebrows, violet accents (matching /markets).
 * Server components — no client JS.
 */

export function DocHeader({
  eyebrow,
  title,
  lead,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-violet-100/40 p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-300/25 blur-3xl" />
      <p className="relative flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-violet-600">
        {Icon && <Icon className="h-4 w-4" />}
        {eyebrow}
      </p>
      <h1 className="relative mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {lead && <div className="relative mt-4 max-w-3xl text-base leading-relaxed text-gray-700">{lead}</div>}
    </header>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-24 border-b border-gray-200 pb-2 text-xl font-semibold tracking-tight text-ink">
      {children}
    </h2>
  );
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-24 text-base font-semibold text-ink">
      {children}
    </h3>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-4 leading-relaxed text-gray-700", className)}>{children}</p>;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-800">{children}</code>;
}

const TONES = {
  info: { box: "border-violet-200 bg-violet-50/60", icon: Info, iconCls: "text-violet-600" },
  warn: { box: "border-amber-200 bg-amber-50/70", icon: AlertTriangle, iconCls: "text-amber-600" },
  ok: { box: "border-emerald-200 bg-emerald-50/70", icon: CheckCircle2, iconCls: "text-emerald-600" },
} as const;

export function Callout({ tone = "info", title, children }: { tone?: keyof typeof TONES; title?: string; children: ReactNode }) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div className={cn("mt-6 flex gap-3 rounded-xl border p-4 text-sm", t.box)}>
      <Icon className={cn("mt-0.5 h-4 w-4 flex-none", t.iconCls)} />
      <div className="min-w-0 text-gray-700">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className={cn(title && "mt-1", "leading-relaxed")}>{children}</div>
      </div>
    </div>
  );
}

/** Responsive table: scrolls sideways inside its own box on phones. */
export function DataTable({
  columns,
  rows,
  mono = [],
  caption,
}: {
  columns: string[];
  rows: ReactNode[][];
  /** Column indexes rendered in monospace. */
  mono?: number[];
  caption?: string;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {caption && <p className="border-b border-gray-100 bg-gray-50/70 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-gray-500">{caption}</p>}
      {/* Phones: one card per row, label above value. */}
      <div className="divide-y divide-gray-100 sm:hidden">
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 px-4 py-3 [overflow-wrap:anywhere]">
            {r.map((cell, j) =>
              cell === "" || cell === null ? null : (
                <div key={j}>
                  {columns[j] && <p className="font-mono text-[10px] uppercase tracking-wide text-gray-400">{columns[j]}</p>}
                  <div className={cn("text-sm text-gray-700", j === 0 && "font-medium text-ink", mono.includes(j) && "font-mono text-xs text-ink")}>{cell}</div>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-violet-50/40">
              {columns.map((c) => (
                <th key={c} className="px-4 py-2.5 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0 odd:bg-white even:bg-gray-50/40">
                {r.map((cell, j) => (
                  <td key={j} className={cn("px-4 py-3 align-top", mono.includes(j) && "font-mono text-xs text-ink")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Numbered vertical timeline. */
export function Steps({ items }: { items: { title: ReactNode; body: ReactNode; tag?: string }[] }) {
  return (
    <ol className="relative mt-6 border-l-2 border-violet-100 pl-6">
      {items.map((it, i) => (
        <li key={i} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-violet-600 font-mono text-[11px] font-bold text-white shadow">
            {i + 1}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{it.title}</p>
            {it.tag && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-mono text-[10px] uppercase text-violet-700">{it.tag}</span>}
          </div>
          <div className="mt-1 text-sm leading-relaxed text-gray-700">{it.body}</div>
        </li>
      ))}
    </ol>
  );
}

export function StatGrid({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode }[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-xl border border-violet-100 bg-white p-4 shadow-[0_6px_20px_-14px_rgba(124,92,255,0.5)] [overflow-wrap:anywhere]">
          <p className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{s.label}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{s.value}</p>
          {s.hint && <p className="mt-1 text-xs text-gray-500">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Steps joined by arrows. Up to 4 steps: one row (stacked on phones).
 * More: a wrapping grid of numbered cards, so labels never get squeezed.
 */
export function Flow({ nodes }: { nodes: { title: string; sub?: string; tone?: "violet" | "ink" | "gray" | "emerald" }[] }) {
  const tone = {
    violet: "border-violet-200 bg-violet-50 text-violet-900",
    ink: "border-ink bg-ink text-paper",
    gray: "border-gray-200 bg-white text-ink",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  if (nodes.length > 4) {
    return (
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        {nodes.map((n, i) => (
          <div key={i} className={cn("relative rounded-xl border px-4 py-3", tone[n.tone ?? "gray"])}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/80 font-mono text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">
                {i + 1}
              </span>
              <p className="text-sm font-semibold">{n.title}</p>
              {i < nodes.length - 1 && <ArrowRight className="ml-auto h-3.5 w-3.5 flex-none opacity-50" />}
            </div>
            {n.sub && <p className="mt-1 pl-7 font-mono text-[10px] opacity-75">{n.sub}</p>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
      {nodes.map((n, i) => (
        <div key={i} className="contents">
          {i > 0 && (
            <div className="flex justify-center text-violet-400 md:px-0.5">
              <ArrowRight className="h-4 w-4 rotate-90 md:rotate-0" />
            </div>
          )}
          <div className={cn("flex-1 rounded-xl border px-3 py-3 text-center", tone[n.tone ?? "gray"])}>
            <p className="text-sm font-semibold">{n.title}</p>
            {n.sub && <p className="mt-0.5 font-mono text-[10px] opacity-75">{n.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGrid({ items }: { items: { href: string; title: string; body: string; tag?: string }[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="link-plain group rounded-xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_10px_30px_-18px_rgba(124,92,255,0.6)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-ink group-hover:text-violet-700">{it.title}</p>
            <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
          </div>
          {it.tag && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-violet-600">{it.tag}</p>}
          <p className="mt-1.5 text-sm text-gray-600">{it.body}</p>
        </Link>
      ))}
    </div>
  );
}

export function TwoCol({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="mt-6 grid gap-4 md:grid-cols-2">{[left, right].map((x, i) => <div key={i} className="min-w-0">{x}</div>)}</div>;
}

export function Panel({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("h-full rounded-xl border p-4", accent ? "border-violet-200 bg-violet-50/50" : "border-gray-200 bg-white")}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}
