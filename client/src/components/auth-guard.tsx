"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Client-side gate: boot-refresh while loading, bounce to /login when anon,
 * render the protected subtree once authenticated.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "auth") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="size-2 animate-pulse rounded-full bg-amber-glow" />
      </div>
    );
  }
  return <>{children}</>;
}
