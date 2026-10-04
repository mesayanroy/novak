import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface IphoneProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Iphone({
  src = "/iphone-screen.png",
  children,
  className,
  ...props
}: IphoneProps) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[320px] select-none",
        className
      )}
      {...props}
    >
      {/* Main iPhone Body Frame (Sleek Dark Titanium Bezel) */}
      <div className="relative aspect-[266/568] w-full rounded-[44px] bg-gradient-to-b from-[#2e2938] via-[#1d1826] to-[#110e19] p-[7px] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.25)] ring-1 ring-white/15">
        
        {/* Inner Bezel Layer */}
        <div className="relative h-full w-full rounded-[38px] bg-[#0c0a10] p-[5px] ring-1 ring-white/10">

          {/* Left Side Buttons (Action, Vol Up, Vol Down) */}
          <div className="absolute -left-[9px] top-[85px] h-[20px] w-[3px] rounded-l-md bg-[#423954]" />
          <div className="absolute -left-[9px] top-[118px] h-[38px] w-[3px] rounded-l-md bg-[#423954]" />
          <div className="absolute -left-[9px] top-[166px] h-[38px] w-[3px] rounded-l-md bg-[#423954]" />

          {/* Right Side Power Button */}
          <div className="absolute -right-[9px] top-[135px] h-[55px] w-[3px] rounded-r-md bg-[#423954]" />

          {/* iPhone Display Glass Container */}
          <div className="relative h-full w-full overflow-hidden rounded-[33px] bg-[#f8f6fc]">
            {/* Screen Content */}
            {children ? (
              <div className="h-full w-full overflow-y-auto">{children}</div>
            ) : src ? (
              <div className="relative h-full w-full overflow-hidden pt-6 bg-[#f8f6fc]">
                <Image
                  src={src}
                  alt="Novak Mobile Display"
                  fill
                  sizes="320px"
                  priority
                  className="object-cover object-top"
                />
              </div>
            ) : null}

            {/* Camera Pinhole / Dynamic Island (Positioned neatly above Novak logo line) */}
            <div className="absolute left-1/2 top-1.5 z-30 flex h-[18px] w-[80px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-2 shadow-sm ring-1 ring-white/10">
              <div className="flex h-2 w-2 items-center justify-center rounded-full bg-[#121215] ring-1 ring-white/10">
                <div className="h-1 w-1 rounded-full bg-[#08182b]" />
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-[#0c1420] ring-1 ring-indigo-500/20" />
            </div>

            {/* Subtle Screen Glass Overlay */}
            <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-transparent via-white/[0.01] to-white/[0.05]" />

            {/* iPhone Home Bar Indicator */}
            <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-30 h-[3px] w-[90px] -translate-x-1/2 rounded-full bg-black/60 backdrop-blur-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
