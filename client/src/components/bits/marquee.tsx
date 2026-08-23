"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface MarqueeProps {
  items: string[];
  className?: string;
}

/** Edge-faded tech marquee. Reduced motion: one static, wrapped row. */
export function Marquee({ items, className }: MarqueeProps) {
  const reduce = useReducedMotion();

  const row = (ariaHidden: boolean) => (
    <ul
      aria-hidden={ariaHidden || undefined}
      className="flex w-max shrink-0 items-center gap-10 pr-10"
    >
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-ink-3"
        >
          <span className="size-1 rounded-full bg-amber-dim" />
          {item}
        </li>
      ))}
    </ul>
  );

  if (reduce) {
    return (
      <div className={cn("overflow-x-auto", className)}>
        <div className="flex w-max items-center gap-10">
          {items.map((item) => (
            <span
              key={item}
              className="font-mono text-xs uppercase tracking-[0.22em] text-ink-3"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className
      )}
    >
      <div className="flex w-max animate-[marquee_30s_linear_infinite] will-change-transform">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
