"use client";

import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * KokonutUI-style drifting dot grid. Pure background-position animation
 * (paint-cheap), elliptically masked so it fades before edges.
 */
export function GridPattern({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        !reduce && "animate-[grid-pan_7s_linear_infinite]",
        "[background-image:radial-gradient(rgba(237,241,247,0.08)_1px,transparent_1px)]",
        "[background-size:26px_26px]",
        "[mask-image:radial-gradient(ellipse_60%_60%_at_center,black_30%,transparent_75%)]",
        className
      )}
    />
  );
}
