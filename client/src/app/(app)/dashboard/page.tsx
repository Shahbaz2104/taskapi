"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTaskMutations, useTasks } from "@/hooks/use-tasks";
import type { Task, TaskFilters, TaskInput, TaskStatus } from "@/lib/tasks-api";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Done" },
] as const;

const EMPTY_COPY: Record<string, string> = {
  all: "Nothing in the queue. Create your first task.",
  pending: "No pending tasks — enjoy the clear runway.",
  in_progress: "Nothing in flight right now.",
  completed: "No completions yet. Go ship something.",
};

export default function Dashboard() {
  const [statusTab, setStatusTab] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState("-createdAt");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const search = useDebouncedValue(searchText);

  const filters = useMemo<TaskFilters>(
    () => ({
      page,
      limit: 10,
      sort,
      search: search || undefined,
      status: statusTab === "all" ? undefined : (statusTab as TaskStatus),
    }),
    [page, sort, search, statusTab]
  );

  const { data, isPending, isFetching, isError, error } = useTasks(filters);
  const { create, setStatus, edit, remove } = useTaskMutations(filters);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(task: Task) {
    setEditing(task);
    setDialogOpen(true);
  }
  function handleSubmit(input: TaskInput) {
    if (editing) edit.mutate({ id: editing._id, patch: input });
    else create.mutate(input);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Control deck
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {data
              ? `${data.total} task${data.total === 1 ? "" : "s"} on the board`
              : "Loading telemetry…"}
            {isFetching && !isPending && (
              <span className="ml-2 inline-block size-1.5 animate-pulse rounded-full bg-amber-glow align-middle" />
            )}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} weight="bold" />
          New task
        </Button>
      </div>

      {/* ── Filter bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={statusTab}
          onValueChange={(v) => {
            setStatusTab(v);
            setPage(1);
          }}
        >
          <TabsList className="bg-surface border border-line">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-xs"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative min-w-52 flex-1">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            placeholder="Search tasks…"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1);
            }}
            className="pl-9"
            aria-label="Search tasks"
          />
        </div>

        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-line">
            <SelectItem value="-createdAt">Newest</SelectItem>
            <SelectItem value="createdAt">Oldest</SelectItem>
            <SelectItem value="-priority">Priority</SelectItem>
            <SelectItem value="dueDate">Due soonest</SelectItem>
            <SelectItem value="-dueDate">Due latest</SelectItem>
            <SelectItem value="-updatedAt">Recently touched</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── List ───────────────────────────────────────── */}
      {isError && (
        <p className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error instanceof Error ? error.message : "Couldn't load tasks"}
        </p>
      )}

      {isPending ? (
        <ul className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="rounded-card border border-line bg-card px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 rounded-full bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5 bg-surface-2" />
                  <Skeleton className="h-3 w-1/5 bg-surface-2" />
                </div>
              </div>
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
                <TaskRow
                  key={task._id}
                  task={task}
                  onToggle={(next) =>
                    setStatus.mutate({
                      id: task._id,
                      status:
                        next === true
                          ? "completed"
                          : task.status === "completed"
                            ? "pending"
                            : task.status,
                    })
                  }
                  onEdit={() => openEdit(task)}
                  onDelete={() => remove.mutate(task._id)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>

          {/* Pagination */}
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
          <p className="text-sm text-ink-2">
            {EMPTY_COPY[statusTab] ?? EMPTY_COPY.all}
          </p>
          {statusTab === "all" && !search && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openCreate}
            >
              <Plus size={14} weight="bold" />
              New task
            </Button>
          )}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        onSubmit={handleSubmit}
        pending={create.isPending || edit.isPending}
      />
    </div>
  );
}
