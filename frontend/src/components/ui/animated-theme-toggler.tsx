"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Moon, SunDim } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Magic UI AnimatedThemeToggler (magicui.design/r/animated-theme-toggler),
 * adapted for this repo: toggles `dark` on <html>, remembers the choice in
 * localStorage ("novak.theme"), and reveals the new theme as a circle growing
 * from the button (View Transitions API; instant switch where unsupported or
 * when the visitor prefers reduced motion).
 */
export const THEME_KEY = "novak.theme";

export function AnimatedThemeToggler({ className, duration = 600 }: { className?: string; duration?: number }) {
  const [isDark, setIsDark] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => setIsDark(document.documentElement.classList.contains("dark"));
    sync();
    const o = new MutationObserver(sync);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => o.disconnect();
  }, []);

  const apply = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode */
    }
    setIsDark(dark);
  };

  const toggle = async () => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce || !buttonRef.current) return apply();
    await doc.startViewTransition(() => flushSync(apply)).ready;
    const { top, left, width, height } = buttonRef.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:border-violet-300 hover:text-violet-700",
        className,
      )}
    >
      <SunDim className={cn("absolute h-[18px] w-[18px] transition-all duration-300", isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
      <Moon className={cn("absolute h-[17px] w-[17px] transition-all duration-300", isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}
