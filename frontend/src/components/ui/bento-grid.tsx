import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
    <div
      className={cn(
        "grid w-full auto-rows-[22rem] grid-cols-3 gap-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href = "#",
  cta = "Learn more",
  ...props
}: BentoCardProps) => (
  <div
    key={name}
    className={cn(
      "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-md border border-gray-200 bg-paper p-1 transition-all duration-300 hover:border-gray-400 hover:shadow-md",
      className
    )}
    {...props}
  >
    <div className="relative h-full w-full overflow-hidden rounded-sm bg-gray-50/50">
      {background}
    </div>

    <div className="pointer-events-none z-10 flex flex-col gap-1.5 p-5 transition-all duration-300 group-hover:-translate-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-paper text-ink shadow-2xs transition-transform duration-300 group-hover:scale-110">
          <Icon className="h-5 w-5 text-ink" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-ink font-sans">
          {name}
        </h3>
      </div>
      <p className="max-w-md text-xs text-gray-600 leading-relaxed font-sans">
        {description}
      </p>
    </div>

    {href && (
      <div className="pointer-events-none absolute bottom-4 right-4 flex translate-y-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <Button
          variant="secondary"
          size="sm"
          asChild
          className="pointer-events-auto h-7 gap-1.5 text-xs font-mono font-medium border border-gray-300 bg-paper text-ink hover:bg-gray-100"
        >
          <a href={href}>
            {cta}
            <ArrowRight className="h-3 w-3" />
          </a>
        </Button>
      </div>
    )}

    <div className="pointer-events-none absolute inset-0 transition-colors duration-300 group-hover:bg-ink/[0.01]" />
  </div>
);
