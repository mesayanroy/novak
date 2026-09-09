"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DocsSidebarNav } from "@/components/docs/DocsSidebar";

export function DocsLayoutShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="link-plain inline-flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-sm">
            <Menu className="h-4 w-4" />
            Docs menu
          </SheetTrigger>
          <SheetContent>
            <p className="mb-4 font-mono text-xs uppercase tracking-wide text-gray-500">Docs</p>
            <DocsSidebarNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 font-mono text-xs uppercase tracking-wide text-gray-500">Docs</p>
            <DocsSidebarNav />
          </div>
        </aside>
        <div className="min-w-0 max-w-prose">{children}</div>
      </div>
    </div>
  );
}
