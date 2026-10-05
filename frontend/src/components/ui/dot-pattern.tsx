"use client";

/**
 * Magic UI DotPattern (magicui.design/r/dot-pattern), adapted for this repo:
 * framer-motion instead of motion/react, a ResizeObserver instead of a window
 * listener, and the random glow timings computed once per size (not on every
 * render).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
}

export function DotPattern({ width = 16, height = 16, x = 0, y = 0, cx = 1, cy = 1, cr = 1, className, glow = false, ...props }: DotPatternProps) {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setDimensions({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dots = useMemo(() => {
    const cols = Math.ceil(dimensions.width / width);
    const rows = Math.ceil(dimensions.height / height);
    return Array.from({ length: cols * rows }, (_, i) => ({
      x: (i % cols) * width + cx + x,
      y: Math.floor(i / cols) * height + cy + y,
      delay: Math.random() * 5,
      duration: Math.random() * 3 + 2,
    }));
  }, [dimensions.width, dimensions.height, width, height, cx, cy, x, y]);

  return (
    <svg ref={containerRef} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full text-neutral-400/80", className)} {...props}>
      <defs>
        <radialGradient id={`${id}-gradient`}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot) =>
        glow ? (
          <motion.circle
            key={`${dot.x}-${dot.y}`}
            cx={dot.x}
            cy={dot.y}
            r={cr}
            fill={`url(#${id}-gradient)`}
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.5, 1] }}
            transition={{ duration: dot.duration, repeat: Infinity, repeatType: "reverse", delay: dot.delay, ease: "easeInOut" }}
          />
        ) : (
          <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={cr} fill="currentColor" />
        ),
      )}
    </svg>
  );
}
