"use client";

import { useState } from "react";
import { Check, Copy, Terminal, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CodeSnippetTab {
  id: string;
  label: string;
  code: string;
  language?: string;
}

export function CodeBlock({
  code,
  tabs,
  variant = "light",
  label,
  className,
}: {
  code?: string;
  tabs?: CodeSnippetTab[];
  variant?: "light" | "dark";
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string>(tabs && tabs.length > 0 ? tabs[0].id : "");

  const activeSnippet = tabs && tabs.length > 0
    ? tabs.find((t) => t.id === activeTabId)?.code || tabs[0].code
    : code || "";

  async function onCopy() {
    await navigator.clipboard.writeText(activeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border transition-all duration-200",
        variant === "dark" ? "border-ink bg-ink text-paper" : "border-gray-300 bg-gray-50/90 text-ink",
        className,
      )}
    >
      {/* Tab bar or Label Header */}
      {(tabs || label) && (
        <div
          className={cn(
            "flex items-center justify-between border-b px-3 py-1.5 font-mono text-xs uppercase tracking-wide",
            variant === "dark" ? "border-paper/20 bg-ink text-paper/70" : "border-gray-200 bg-gray-100/80 text-gray-600",
          )}
        >
          {tabs && tabs.length > 0 ? (
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-mono transition-colors",
                    activeTabId === tab.id
                      ? variant === "dark"
                        ? "bg-paper text-ink font-semibold"
                        : "bg-ink text-paper font-semibold"
                      : "text-gray-500 hover:text-ink hover:bg-gray-200/50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-gray-400" />
              <span>{label}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onCopy}
              aria-label="Copy code to clipboard"
              className={cn(
                "flex items-center gap-1 text-[10px] font-mono rounded px-2 py-0.5 transition-all duration-150",
                copied
                  ? "bg-ink text-paper"
                  : variant === "dark"
                    ? "text-paper/70 hover:bg-paper/10 hover:text-paper"
                    : "text-gray-600 hover:bg-gray-200 hover:text-ink"
              )}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Code Container */}
      <div className="relative">
        {!tabs && !label && (
          <button
            onClick={onCopy}
            aria-label="Copy to clipboard"
            className={cn(
              "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded transition-colors z-10",
              variant === "dark" ? "text-paper/60 hover:bg-paper/10 hover:text-paper" : "text-gray-500 hover:bg-gray-200 hover:text-ink"
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}

        <pre className="overflow-x-auto px-4 py-3.5 font-mono text-xs leading-relaxed selection:bg-ink selection:text-paper">
          <code>{activeSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
