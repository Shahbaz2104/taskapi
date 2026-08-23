"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT_STRONG } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** "up" fades+rises; "clip" wipes open top-to-bottom (image-style). */
  variant?: "up" | "clip";
  delay?: number;
}

/** Scroll-triggered entrance. Fires once; reduced motion falls back to fade. */
export function Reveal({
  children,
  className,
  variant = "up",
  delay = 0,
}: RevealProps) {
  const reduce = useReducedMotion();

  if (variant === "clip") {
    return (
      <motion.div
        className={className}
        initial={{ clipPath: "inset(0 0 100% 0)", opacity: reduce ? 0 : 1 }}
        whileInView={{ clipPath: "inset(0 0 0% 0)", opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{
          clipPath: reduce
            ? undefined
            : { duration: 0.8, ease: EASE_OUT_STRONG, delay },
          opacity: reduce ? { duration: 0.3, delay } : undefined,
        }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={
        reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(16px)" }
      }
      whileInView={
        reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }
      }
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease: EASE_OUT_STRONG, delay }}
    >
      {children}
    </motion.div>
  );
}
