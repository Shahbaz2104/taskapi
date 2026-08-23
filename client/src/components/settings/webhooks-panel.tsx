"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Broadcast,
  CheckCircle,
  CircleNotch,
  Trash,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebhookMutations, useWebhooks } from "@/hooks/use-settings";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/settings-api";

export function WebhooksPanel() {
  const { data, isPending } = useWebhooks();
  const { create, update, remove, ping } = useWebhookMutations();
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<WebhookEvent>>(
    new Set(["task.created", "task.completed"])
  );
  /** Secret is shown exactly once after creation. */
  const [freshSecret, setFreshSecret] = useState<{
    secret: string;
    url: string;
  } | null>(null);

  function toggleEvent(ev: WebhookEvent) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || events.size === 0) return;
    create.mutate(
      { url: url.trim(), events: [...events] },
      {
        onSuccess: (hook) => {
          setCreateOpen(false);
          setUrl("");
          if (hook.secret)
            setFreshSecret({ secret: hook.secret, url: hook.url });
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Shown-once secret banner */}
      <AnimatePresence>
        {freshSecret && (
          <motion.div
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0 }}
            className="rounded-card border border-amber-dim/50 bg-amber-glow/10 p-4"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-amber-bright">
              <Warning size={16} weight="fill" />
              Signing secret — shown once
            </p>
            <code className="mt-2 block break-all rounded-field bg-base px-3 py-2 font-mono text-xs">
              {freshSecret.secret}
            </code>
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              for {freshSecret.url}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(freshSecret.secret);
                  toast.success("Secret copied");
                }}
              >
                Copy
              </Button>
              <Button size="sm" onClick={() => setFreshSecret(null)}>
                I've stored it safely
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">
          POST deliveries signed with{" "}
          <code className="font-mono text-xs">X-TaskAPI-Signature</code>.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Broadcast size={15} weight="fill" />
          Add endpoint
        </Button>
      </div>

      {isPending &&
        Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 bg-surface-2" />
        ))}

      {(data?.webhooks.length ?? 0) > 0 && (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {data!.webhooks.map((hook) => (
              <motion.li
                key={hook._id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transform: "scale(0.97)" }}
                transition={{ duration: 0.15 }}
                className="rounded-card border border-line bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={hook.active}
                    onCheckedChange={(active) =>
                      update.mutate({ id: hook._id, patch: { active } })
                    }
                    aria-label={`Toggle ${hook.url}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                    {hook.url}
                  </span>

                  {(hook.consecutiveFailures ?? 0) > 0 && (
                    <Badge className="bg-danger/15 font-mono text-[10px] text-danger">
                      {hook.consecutiveFailures} failing
                    </Badge>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ping.isPending}
                    onClick={() => ping.mutate(hook._id)}
                    aria-label={`Send test ping to ${hook.url}`}
                  >
                    {ping.isPending ? (
                      <CircleNotch size={14} className="animate-spin" />
                    ) : (
                      "Ping"
                    )}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete webhook ${hook.url}`}
                      >
                        <Trash size={15} className="text-danger" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {hook.url}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => remove.mutate(hook._id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                  {hook.events.map((ev) => (
                    <Badge
                      key={ev}
                      variant="outline"
                      className="font-mono text-[10px] text-ink-3"
                    >
                      {ev}
                    </Badge>
                  ))}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {!isPending && (data?.webhooks.length ?? 0) === 0 && (
        <div className="rounded-card border border-dashed border-line bg-card/50 px-6 py-10 text-center">
          <CheckCircle size={24} className="mx-auto text-ink-3" />
          <p className="mt-2 text-sm text-ink-2">
            No endpoints yet — your systems are deaf to task events.
          </p>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-line bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add endpoint</DialogTitle>
            <DialogDescription>
              We'll POST signed JSON on every selected event.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Input
              placeholder="https://your-service.com/hooks/taskapi"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              required
            />
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-2">
                Events
              </legend>
              {WEBHOOK_EVENTS.map((ev) => (
                <label
                  key={ev}
                  className="flex cursor-pointer items-center gap-2 rounded-field border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-2 has-checked:border-amber-glow has-checked:text-ink"
                >
                  <input
                    type="checkbox"
                    checked={events.has(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="accent-[#f5a623]"
                  />
                  {ev}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || events.size === 0}
              >
                {create.isPending ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : null}
                Create endpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
