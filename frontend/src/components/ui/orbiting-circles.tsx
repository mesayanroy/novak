/**
 * Magic UI OrbitingCircles (magicui.design/r/orbiting-circles), adapted for
 * Tailwind 3: the `orbit` keyframes live in tailwind.config.ts and the icon
 * size is an inline style instead of v4's `size-(--icon-size)`.
 */
import React from "react";
import { cn } from "@/lib/utils";

export interface OrbitingCirclesProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  radius?: number;
  path?: boolean;
  pathClassName?: string;
  iconSize?: number;
  speed?: number;
}

export function OrbitingCircles({
  className,
  children,
  reverse,
  duration = 20,
  radius = 160,
  path = true,
  pathClassName,
  iconSize = 30,
  speed = 1,
  ...props
}: OrbitingCirclesProps) {
  const calculatedDuration = duration / speed;
  const count = React.Children.count(children);
  return (
    <>
      {path && (
        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" className="pointer-events-none absolute inset-0 h-full w-full">
          <circle className={cn("stroke-violet-300/50", pathClassName)} strokeWidth={1} cx="50%" cy="50%" r={radius} fill="none" />
        </svg>
      )}
      {React.Children.map(children, (child, index) => {
        const angle = (360 / count) * index;
        return (
          <div
            style={
              {
                "--duration": calculatedDuration,
                "--radius": radius,
                "--angle": angle,
                width: iconSize,
                height: iconSize,
                animationDirection: reverse ? "reverse" : undefined,
              } as React.CSSProperties
            }
            className={cn("absolute flex transform-gpu animate-orbit items-center justify-center rounded-full motion-reduce:[animation-play-state:paused]", className)}
            {...props}
          >
            {child}
          </div>
        );
      })}
    </>
  );
}
