"use client";

import { motion, useReducedMotion } from "motion/react";
import { fadeUp, fadeIn, staggerList } from "@/lib/motion";

/**
 * Landing hero entrance — rare/first-time tier, so a choreographed
 * stagger is allowed. Reduced motion degrades to opacity-only.
 */
export function HeroIntro() {
  const reduce = useReducedMotion();
  const item = reduce ? fadeIn : fadeUp;

  return (
    <motion.div variants={staggerList(0.08)} initial="hidden" animate="show">
      <motion.p
        variants={item}
        className="font-mono text-xs uppercase tracking-[0.3em] text-amber-glow"
      >
        Mission control for your tasks
      </motion.p>
      <motion.h1
        variants={item}
        className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
      >
        Every task.
        <br />
        One control deck.
      </motion.h1>
      <motion.p variants={item} className="mt-6 max-w-xl text-lg text-ink-2">
        Sessions, two-factor auth, signed webhooks, team collaboration — a
        production-grade task API, flown from one dashboard.
      </motion.p>
      <motion.dl
        variants={item}
        className="mt-12 grid grid-cols-3 gap-8 font-mono text-sm"
      >
        {[
          ["149", "tests green"],
          ["36", "API endpoints"],
          ["HMAC", "signed webhooks"],
        ].map(([value, label]) => (
          <div key={label}>
            <dt className="text-2xl font-semibold text-ink">{value}</dt>
            <dd className="mt-1 text-xs uppercase tracking-widest text-ink-3">
              {label}
            </dd>
          </div>
        ))}
      </motion.dl>
    </motion.div>
  );
}
