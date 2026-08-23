"use client";

import { useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * KokonutUI-style spotlight card — a soft amber radial follows the cursor.
 * Direct CSS-var writes (no re-render); gradient gated to fine pointers.
 */
export function SpotlightCard({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--sx", `${e.clientX - rect.left}px`);
        el.style.setProperty("--sy", `${e.clientY - rect.top}px`);
      }}
      className={cn(
        "group relative overflow-hidden rounded-card border border-line bg-card",
        className
      )}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 hidden [@media(hover:hover)_and_(pointer:fine)]:block"
        style={{
          background:
            "radial-gradient(340px circle at var(--sx, 50%) var(--sy, 50%), rgba(245,166,35,0.09), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
