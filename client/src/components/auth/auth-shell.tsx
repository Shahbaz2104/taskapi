"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fadeUp } from "@/lib/motion";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  footer: ReactNode;
  children: ReactNode;
  error?: string | null;
}

/** Shared centered card for every auth surface. */
export function AuthShell({
  title,
  subtitle,
  footer,
  children,
  error,
}: AuthShellProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="relative z-10 w-full max-w-sm"
    >
      <div className="rounded-card border border-line bg-card p-8 shadow-2xl shadow-black/40">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-widest"
        >
          TASK<span className="text-amber-bright">API</span>
        </Link>

        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}

        {error && (
          <motion.p
            key={error}
            animate={{ x: [0, -7, 7, -4, 0] }}
            transition={{ duration: 0.3 }}
            role="alert"
            className="mt-4 rounded-field border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </motion.p>
        )}

        <div className={error ? "mt-4" : "mt-6"}>{children}</div>
      </div>

      <div className="mt-5 text-center text-sm text-ink-2">{footer}</div>
    </motion.div>
  );
}
