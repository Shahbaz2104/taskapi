"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ArrowCounterClockwise,
  Trash,
  TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useTrash, useTrashMutations } from "@/hooks/use-trash";
import type { TaskFilters } from "@/lib/tasks-api";

dayjs.extend(relativeTime);

export default function TrashPage() {
  const [page, setPage] = useState(1);
  const filters = useMemo<TaskFilters>(() => ({ page, limit: 10 }), [page]);
  const { data, isPending } = useTrash(filters);
  const { bulk, clear } = useTrashMutations(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Trash
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Soft-deleted tasks. Purged automatically after the retention window.
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!data?.total}>
              <TrashSimple size={16} />
              Empty trash
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes all {data?.total ?? 0} trashed task
                {data?.total === 1 ? "" : "s"}. There is no undo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep them</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => clear.mutate()}
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isPending ? (
        <ul className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-card border border-line bg-card px-4 py-4"
            >
              <Skeleton className="h-4 w-1/3 bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : data && data.tasks.length > 0 ? (
        <>
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="space-y-2.5"
          >
            <AnimatePresence initial={false}>
              {data.tasks.map((task) => (
                <motion.li
                  key={task._id}
                  layout
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "scale(0.97)" }}
                  transition={{ duration: 0.18 }}
                  className="group flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-2">
                      {task.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      trashed{" "}
                      {task.deletedAt
                        ? dayjs(task.deletedAt).fromNow()
                        : "recently"}
                      {task.tags?.length
                        ? ` · ${task.tags.map((t) => `#${t}`).join(" ")}`
                        : ""}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      bulk.mutate({ ids: [task._id], action: "restore" })
                    }
                  >
                    <ArrowCounterClockwise size={14} />
                    Restore
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete "${task.title}" forever`}
                      >
                        <Trash size={15} className="text-danger" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete forever?</AlertDialogTitle>
                        <AlertDialogDescription>
                          “{task.title}” will be permanently removed. No undo.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() =>
                            bulk.mutate({ ids: [task._id], action: "purge" })
                          }
                        >
                          Delete forever
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="font-mono text-xs text-ink-3">
                page {data.page} / {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card/50 px-6 py-14 text-center">
          <TrashSimple size={28} className="mx-auto text-ink-3" />
          <p className="mt-3 text-sm text-ink-2">
            Trash is empty — deleted tasks wait here.
          </p>
        </div>
      )}
    </div>
  );
}
