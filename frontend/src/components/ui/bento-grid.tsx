import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
}

export interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string;
  className: string;
  background: ReactNode;
  Icon: React.ElementType;
  description: string;
  href?: string;
  cta?: string;
}

export const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div className={cn("grid w-full auto-rows-[24rem] grid-cols-3 gap-4", className)} {...props}>
      {children}
    </div>
  );
};

/**
 * Visual on top, copy below. The call to action lives in its own footer row
 * under the description (never floated over it), so nothing overlaps at any
 * width or on hover.
 */
export const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta = "Learn more",
  ...props
}: BentoCardProps) => (
  <div
    key={name}
    className={cn(
      "group relative col-span-3 flex flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white p-1.5 shadow-[0_10px_30px_-24px_rgba(109,74,255,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_44px_-24px_rgba(109,74,255,0.7)]",
      className,
    )}
    {...props}
  >
    <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-gradient-to-b from-violet-50/70 to-white">
      {background}
    </div>

    <div className="relative z-10 flex flex-col gap-2 px-4 pb-3 pt-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">{name}</h3>
      </div>
      <p className="line-clamp-3 text-[13px] leading-relaxed text-gray-600">{description}</p>
      {href && (
        <Link
          href={href}
          className="link-plain mt-0.5 inline-flex w-fit items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-700 hover:text-violet-900"
        >
          {cta}
          <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  </div>
);
