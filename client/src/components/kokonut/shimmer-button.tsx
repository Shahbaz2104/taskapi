"use client";

import type { ComponentProps } from "react";
import { useReducedMotion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShimmerButtonProps = ComponentProps<"a"> & {
  variant?: "primary" | "secondary" | "outline";
};

/** CTA with a periodic light sweep — marketing-tier delight only. */
export function ShimmerButton({
  className,
  variant = "primary",
  children,
  ...props
}: ShimmerButtonProps) {
  const reduce = useReducedMotion();

  return (
    <a
      className={cn(
        "relative overflow-hidden",
        buttonVariants({ size: "lg", variant }),
        className
      )}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
      {!reduce && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 bg-white/25 blur-md will-change-transform animate-[shimmer-sweep_3.4s_ease-in-out_infinite]"
        />
      )}
    </a>
  );
}
