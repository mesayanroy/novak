import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full border border-gray-300 bg-paper px-3 font-mono text-sm text-ink placeholder:text-gray-400",
        "focus-visible:border-ink",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
