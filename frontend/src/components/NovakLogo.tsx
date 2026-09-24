import React from "react";

export function NovakLogo({ className = "h-6 w-6", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <g fill="currentColor">
        {/* Top-Left Petal */}
        <path d="M 46 8 C 24 14 14 24 8 46 C 22 46 36 40 46 30 C 46 20 46 14 46 8 Z" />
        {/* Top-Right Petal */}
        <path d="M 54 8 C 76 14 86 24 92 46 C 78 46 64 40 54 30 C 54 20 54 14 54 8 Z" />
        {/* Bottom-Left Petal */}
        <path d="M 46 92 C 24 86 14 76 8 54 C 22 54 36 60 46 70 C 46 80 46 86 46 92 Z" />
        {/* Bottom-Right Petal */}
        <path d="M 54 92 C 76 86 86 76 92 54 C 78 54 64 60 54 70 C 54 80 54 86 54 92 Z" />
      </g>
    </svg>
  );
}
