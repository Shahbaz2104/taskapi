import { cn } from "@/lib/utils";

/**
 * Slow-breathing color fields behind the hero. Pure CSS transforms,
 * frozen by the global reduced-motion rule.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute -top-[20%] left-[8%] h-[55%] w-[45%] rounded-full opacity-25 blur-3xl will-change-transform animate-[aurora-a_22s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(245,166,35,0.32), transparent)",
        }}
      />
      <div
        className="absolute top-[30%] right-[4%] h-[60%] w-[50%] rounded-full opacity-20 blur-3xl will-change-transform animate-[aurora-b_26s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(108,169,255,0.28), transparent)",
        }}
      />
    </div>
  );
}
