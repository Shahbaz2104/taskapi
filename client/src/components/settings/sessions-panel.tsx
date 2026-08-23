"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { DeviceMobile, Monitor } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getSessionId } from "@/lib/api";
import { useRevokeSession, useSessions } from "@/hooks/use-settings";

dayjs.extend(relativeTime);

export function SessionsPanel() {
  const { data, isPending } = useSessions();
  const revoke = useRevokeSession();
  const currentId = typeof window !== "undefined" ? getSessionId() : null;

  const rows = useMemo(
    () =>
      data?.sessions.map((s) => ({
        ...s,
        mobile: /mobile|android|iphone/i.test(s.userAgent ?? ""),
      })) ?? [],
    [data]
  );

  return (
    <div className="space-y-2.5">
      <p className="text-sm text-ink-2">
        Every device holding a live token. Revoke anything you don't recognize.
      </p>

      {isPending &&
        Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-card bg-surface-2"
          />
        ))}

      {rows.map((s) => {
        const isCurrent = s._id === currentId;
        return (
          <div
            key={s._id}
            className="flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3"
          >
            {s.mobile ? (
              <DeviceMobile size={20} className="shrink-0 text-ink-3" />
            ) : (
              <Monitor size={20} className="shrink-0 text-ink-3" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                {shortAgent(s.userAgent)}
                {isCurrent && (
                  <Badge className="ml-2 bg-ok/15 font-mono text-[10px] uppercase text-ok">
                    this device
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                {s.ip ?? "unknown ip"} · signed in{" "}
                {dayjs(s.createdAt).fromNow()}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={isCurrent}>
                  Sign out device
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out this device?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Its tokens stop working immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revoke.mutate(s._id)}>
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      })}
    </div>
  );
}

function shortAgent(ua?: string) {
  if (!ua) return "Unknown device";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Browser";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /mac os/i.test(ua)
      ? "macOS"
      : /android/i.test(ua)
        ? "Android"
        : /iphone|ipad|ios/i.test(ua)
          ? "iOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" · ");
}
