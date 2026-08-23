import type { Transition, Variants } from "motion/react";

/**
 * Motion tokens — single source of truth.
 * Functional UI stays ≤300ms with strong ease-out (Emil Kowalski discipline).
 * Marketing surfaces may use longer, choreographed timings.
 */
export const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT_STRONG = [0.77, 0, 0.175, 1] as const;

export const springSoft: Transition = {
  type: "spring",
  duration: 0.5,
  bounce: 0.2,
};

/** Standard enter: fade + slight rise. Nothing appears from scale(0). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, transform: "translateY(10px)" },
  show: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.25, ease: EASE_OUT_STRONG },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT_STRONG } },
};

/** List stagger — 50ms steps, never blocking interaction. */
export const staggerList = (step = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step } },
});

/** Press feedback lives in CSS (button.tsx); this is for motion-driven pressables. */
export const pressWhileTap = { scale: 0.97 };
