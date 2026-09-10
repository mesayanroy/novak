"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu, BookOpen, Layers } from "lucide-react";
import { motion, useScroll, useSpring } from "framer-motion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DocsSidebarNav } from "@/components/docs/DocsSidebar";
import { DocsTableOfContents } from "@/components/docs/DocsTableOfContents";

export function DocsLayoutShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="relative min-h-screen bg-paper">
      {/* Top Reading Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 bg-ink z-50 origin-left"
        style={{ scaleX }}
      />

      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Mobile Navigation Trigger */}
        <div className="mb-6 flex items-center justify-between lg:hidden border-b border-gray-200 pb-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="link-plain inline-flex items-center gap-2 border border-gray-300 bg-paper px-3 py-1.5 text-sm font-medium rounded-sm hover:border-ink transition-colors">
              <Menu className="h-4 w-4" />
              Navigation Menu
            </SheetTrigger>
            <SheetContent className="w-80">
              <div className="flex items-center gap-2 mb-4 font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">
                <BookOpen className="h-4 w-4 text-ink" />
                Novak Protocol Spec
              </div>
              <DocsSidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <span className="font-mono text-xs text-gray-500">SPEC v1.0</span>
        </div>

        {/* 3-Column Layout (Sidebar Nav, Main Article Content, TOC) */}
        <div className="grid gap-10 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_210px]">
          {/* Left Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="flex items-center gap-2 mb-3 font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                <Layers className="h-3.5 w-3.5 text-ink" />
                Specification
              </div>
              <DocsSidebarNav />
              
              <div className="mt-8 border-t border-gray-200 pt-4 font-mono text-[11px] text-gray-500 flex flex-col gap-1">
                <span>Oracle Layer: <strong className="text-ink font-semibold">Novak v1</strong></span>
                <span>Chain: <strong className="text-ink font-semibold">Ethereum / EVM</strong></span>
              </div>
            </div>
          </aside>

          {/* Main Article Container */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="min-w-0 max-w-prose"
          >
            {children}
          </motion.div>

          {/* Right TOC Sidebar */}
          <DocsTableOfContents />
        </div>
      </div>
    </div>
  );
}
