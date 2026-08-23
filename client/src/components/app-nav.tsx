"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AppNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-widest"
        >
          TASK<span className="text-amber-bright">API</span>
        </Link>
        <div className="flex items-center gap-4">
          {user && (
            <span className="font-mono text-xs text-ink-2">{user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
