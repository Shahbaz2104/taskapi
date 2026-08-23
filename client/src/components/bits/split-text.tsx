"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT_STRONG } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface SplitTextProps {
  text: string;
  className?: string;
  /** Seconds before the rise begins. */
  delay?: number;
}

/**
 * KokonutUI-style word-rise headline: words climb out of their own
 * clipping mask. Reduced motion renders the plain string.
 */
export function SplitText({ text, className, delay = 0 }: SplitTextProps) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;

  return (
    <motion.span
      className={cn("inline-block", className)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      transition={{ staggerChildren: 0.035, delayChildren: delay }}
      aria-label={text}
    >
      {text.split(" ").map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden pb-[0.08em] align-bottom"
          aria-hidden
        >
          <motion.span
            className="inline-block will-change-transform"
            variants={{
              hidden: { transform: "translateY(110%)" },
              show: {
                transform: "translateY(0%)",
                transition: { duration: 0.7, ease: EASE_OUT_STRONG },
              },
            }}
          >
            {word}
            {i < text.split(" ").length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
