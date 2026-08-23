"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Deck" },
  { href: "/shared", label: "Shared" },
  { href: "/trash", label: "Trash" },
];

export function AppNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-7">
          <Link
            href="/"
            className="font-mono text-sm font-semibold tracking-widest"
          >
            TASK<span className="text-amber-bright">API</span>
          </Link>
          <nav className="flex items-center gap-5">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative py-1 text-sm transition-colors duration-150 ease-out",
                  pathname.startsWith(link.href)
                    ? "text-ink after:absolute after:-bottom-[17px] after:left-0 after:h-0.5 after:w-full after:bg-amber-glow"
                    : "text-ink-3 hover:text-ink-2"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
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
