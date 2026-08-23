"use client";

import { useState } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  Check,
  CopySimple,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarFeed, useRotateCalendarFeed } from "@/hooks/use-settings";

export function CalendarFeedCard() {
  const { data, isPending } = useCalendarFeed();
  const rotate = useRotateCalendarFeed();
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!data) return;
    void navigator.clipboard?.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast.success("Feed URL copied");
  }

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <CalendarBlank size={18} className="text-amber-bright" />
          Calendar feed
        </h3>
        <span className="font-mono text-[11px] text-ink-3">
          iCal · RFC 5545
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-2">
        Subscribe from Google Calendar / Apple Calendar (“From URL”). Live tasks
        only — trash is excluded.
      </p>

      {isPending ? (
        <Skeleton className="mt-4 h-10 bg-surface-2" />
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-field border border-line bg-surface px-3 py-2 font-mono text-[11px] text-ink-2">
            {data?.url}
          </code>
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? (
              <Check size={14} weight="bold" />
            ) : (
              <CopySimple size={14} />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Rotate feed URL">
                <ArrowClockwise size={15} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate feed URL?</AlertDialogTitle>
                <AlertDialogDescription>
                  Anyone holding the current URL loses access — including your
                  calendar app until you re-subscribe with the new link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => rotate.mutate()}>
                  Rotate now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
