"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Monospace, high-contrast code block. No syntax-highlight colors, per the
 * design system — token distinction (if ever needed) is weight/italics
 * only, never color.
 */
export function CodeBlock({
  code,
  variant = "light",
  label,
  className,
}: {
  code: string;
  variant?: "light" | "dark";
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded border",
        variant === "dark" ? "border-ink bg-ink text-paper" : "border-gray-300 bg-gray-50 text-ink",
        className,
      )}
    >
      {label && (
        <div
          className={cn(
            "border-b px-4 py-2 font-mono text-xs uppercase tracking-wide",
            variant === "dark" ? "border-paper/20 text-paper/60" : "border-gray-200 text-gray-500",
          )}
        >
          {label}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={onCopy}
        aria-label="Copy to clipboard"
        className={cn(
          "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded transition-colors",
          variant === "dark" ? "text-paper/60 hover:bg-paper/10 hover:text-paper" : "text-gray-500 hover:bg-gray-200 hover:text-ink",
          label && "top-11",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
