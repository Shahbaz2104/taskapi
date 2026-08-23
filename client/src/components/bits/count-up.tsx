"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { EASE_OUT_STRONG } from "@/lib/motion";

interface CountUpProps {
  end: number;
  duration?: number;
  className?: string;
}

/** Counts up once when scrolled into view. Reduced motion: instant. */
export function CountUp({ end, duration = 1.6, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? end : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, end, {
      duration,
      ease: EASE_OUT_STRONG,
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, end, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
