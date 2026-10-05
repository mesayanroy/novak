"use client";

/**
 * Magic UI Terminal (magicui.design/r/terminal), adapted for this repo:
 * framer-motion instead of motion/react, Tailwind 3 colours instead of the
 * shadcn v4 tokens, and an optional title in the window bar.
 */
import { Children, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface SequenceContextValue {
  completeItem: (index: number) => void;
  activeIndex: number;
  sequenceStarted: boolean;
}

const SequenceContext = createContext<SequenceContextValue | null>(null);
const useSequence = () => useContext(SequenceContext);
const ItemIndexContext = createContext<number | null>(null);
const useItemIndex = () => useContext(ItemIndexContext);

interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  startOnView?: boolean;
}

export const AnimatedSpan = ({ children, delay = 0, className, startOnView = false, ...props }: AnimatedSpanProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(elementRef, { amount: 0.3, once: true });
  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!sequence || itemIndex === null || !sequence.sequenceStarted || hasStarted) return;
    if (sequence.activeIndex === itemIndex) setHasStarted(true);
  }, [sequence, hasStarted, itemIndex]);

  const shouldAnimate = sequence ? hasStarted : startOnView ? isInView : true;

  return (
    <motion.div
      ref={elementRef}
      initial={{ opacity: 0, y: -5 }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: 0.3, delay: sequence ? 0 : delay / 1000 }}
      className={cn("grid text-sm font-normal tracking-tight", className)}
      onAnimationComplete={() => {
        if (sequence && itemIndex !== null && shouldAnimate) sequence.completeItem(itemIndex);
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

interface TypingAnimationProps {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  startOnView?: boolean;
}

export const TypingAnimation = ({ children, className, duration = 40, delay = 0, startOnView = true }: TypingAnimationProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(elementRef, { amount: 0.3, once: true });
  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const hasSequence = sequence !== null;
  const sequenceStarted = sequence?.sequenceStarted ?? false;
  const activeIndex = sequence?.activeIndex ?? null;
  const completeRef = useRef<SequenceContextValue["completeItem"] | null>(null);
  const indexRef = useRef<number | null>(null);

  useEffect(() => {
    completeRef.current = sequence?.completeItem ?? null;
    indexRef.current = itemIndex;
  }, [sequence?.completeItem, itemIndex]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (hasSequence && itemIndex !== null) {
      if (sequenceStarted && !started && activeIndex === itemIndex) setStarted(true);
    } else if (!startOnView || isInView) {
      t = setTimeout(() => setStarted(true), delay);
    }
    return () => {
      if (t !== null) clearTimeout(t);
    };
  }, [delay, startOnView, isInView, started, hasSequence, activeIndex, sequenceStarted, itemIndex]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const timer = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.substring(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
        if (completeRef.current && indexRef.current !== null) completeRef.current(indexRef.current);
      }
    }, duration);
    return () => clearInterval(timer);
  }, [children, duration, started]);

  return (
    <span ref={elementRef} className={cn("block min-h-[1.25rem] text-sm font-normal tracking-tight", className)}>
      {displayedText}
    </span>
  );
};

interface TerminalProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  sequence?: boolean;
  startOnView?: boolean;
}

export const Terminal = ({ children, className, title, sequence = true, startOnView = true }: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(containerRef, { amount: 0.3, once: true });
  const [activeIndex, setActiveIndex] = useState(0);
  const sequenceHasStarted = sequence ? !startOnView || isInView : false;

  const contextValue = useMemo<SequenceContextValue | null>(() => {
    if (!sequence) return null;
    return {
      completeItem: (index: number) => setActiveIndex((current) => (index === current ? current + 1 : current)),
      activeIndex,
      sequenceStarted: sequenceHasStarted,
    };
  }, [sequence, activeIndex, sequenceHasStarted]);

  const wrappedChildren = useMemo(() => {
    if (!sequence) return children;
    return Children.toArray(children).map((child, index) => (
      <ItemIndexContext.Provider key={index} value={index}>
        {child}
      </ItemIndexContext.Provider>
    ));
  }, [children, sequence]);

  const content = (
    <div ref={containerRef} className={cn("z-0 w-full rounded-xl border border-gray-200 bg-white", className)}>
      <div className="flex items-center gap-x-2 border-b border-gray-200 px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        {title && <span className="ml-2 truncate font-mono text-[11px] text-gray-500">{title}</span>}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4">
        <code className="grid gap-y-1 font-mono">{wrappedChildren}</code>
      </pre>
    </div>
  );

  return sequence ? <SequenceContext.Provider value={contextValue}>{content}</SequenceContext.Provider> : content;
};
