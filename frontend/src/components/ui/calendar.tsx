"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  className?: string;
  selectedDate?: Date;
  mode?: "single" | "range";
  selected?: Date;
}

export function Calendar({
  className,
  selected = new Date(2026, 4, 11),
}: CalendarProps) {
  const [currentMonth] = useState("MAY 2026");
  const daysOfWeek = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  // Days matrix for May 2026 demo grid
  const days = [
    { day: 26, isCurrent: false },
    { day: 27, isCurrent: false },
    { day: 28, isCurrent: false },
    { day: 29, isCurrent: false },
    { day: 30, isCurrent: false },
    { day: 1, isCurrent: true },
    { day: 2, isCurrent: true },
    { day: 3, isCurrent: true },
    { day: 4, isCurrent: true },
    { day: 5, isCurrent: true },
    { day: 6, isCurrent: true },
    { day: 7, isCurrent: true },
    { day: 8, isCurrent: true },
    { day: 9, isCurrent: true },
    { day: 10, isCurrent: true, isBoundStart: true },
    { day: 11, isCurrent: true, isSelected: true },
    { day: 12, isCurrent: true, isBoundEnd: true },
    { day: 13, isCurrent: true },
    { day: 14, isCurrent: true },
    { day: 15, isCurrent: true },
    { day: 16, isCurrent: true },
    { day: 17, isCurrent: true },
    { day: 18, isCurrent: true },
    { day: 19, isCurrent: true },
    { day: 20, isCurrent: true },
    { day: 21, isCurrent: true },
    { day: 22, isCurrent: true },
    { day: 23, isCurrent: true },
    { day: 24, isCurrent: true },
    { day: 25, isCurrent: true },
    { day: 26, isCurrent: true },
    { day: 27, isCurrent: true },
    { day: 28, isCurrent: true },
    { day: 29, isCurrent: true },
    { day: 30, isCurrent: true },
  ];

  return (
    <div
      className={cn(
        "w-64 rounded-md border border-gray-300 bg-paper p-3 font-mono shadow-sm select-none",
        className
      )}
    >
      <div className="flex items-center justify-between pb-2 border-b border-gray-200">
        <span className="text-xs font-bold text-ink tracking-wider flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-ink" />
          {currentMonth}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" className="p-1 text-gray-500 hover:text-ink">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button type="button" className="p-1 text-gray-500 hover:text-ink">
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold text-gray-400">
        {daysOfWeek.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-xs">
        {days.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              "flex h-7 w-full items-center justify-center rounded-xs transition-colors",
              item.isCurrent ? "text-ink font-medium" : "text-gray-300",
              item.isBoundStart && "bg-gray-100 text-ink border-l-2 border-ink",
              item.isSelected && "bg-ink text-paper font-bold shadow-xs",
              item.isBoundEnd && "bg-gray-100 text-ink border-r-2 border-ink"
            )}
          >
            {item.day}
          </div>
        ))}
      </div>

      {/* Active Resolution Window Banner */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-ink" /> Horizon:
        </span>
        <span className="font-semibold text-ink">48h WITHIN Window</span>
      </div>
    </div>
  );
}
