"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  type Task,
  type TaskFilters,
  type TasksPage,
  type TaskInput,
} from "@/lib/tasks-api";

/** Query-key factory — every cache touch goes through here. */
export const tasksKeys = {
  all: ["tasks"] as const,
  list: (filters: TaskFilters) => ["tasks", "list", filters] as const,
};

/* ── Pure page reducers (unit-tested) ─────────────────────── */

export function patchTaskInPage(
  page: TasksPage | undefined,
  id: string,
  patch: Partial<Task>
): TasksPage | undefined {
  if (!page) return page;
  return {
    ...page,
    tasks: page.tasks.map((t) => (t._id === id ? { ...t, ...patch } : t)),
  };
}

export function removeTaskFromPage(
  page: TasksPage | undefined,
  id: string
): TasksPage | undefined {
  if (!page) return page;
  return {
    ...page,
    tasks: page.tasks.filter((t) => t._id !== id),
    total: Math.max(0, page.total - 1),
  };
}

export function prependTaskToPage(
  page: TasksPage | undefined,
  task: Task
): TasksPage | undefined {
  if (!page || page.page !== 1) return page;
  return { ...page, tasks: [task, ...page.tasks], total: page.total + 1 };
}

/* ── Hooks ────────────────────────────────────────────────── */

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: tasksKeys.list(filters),
    queryFn: () => listTasks(filters),
    placeholderData: (prev) => prev,
  });
}

export function useTaskMutations(filters: TaskFilters) {
  const qc = useQueryClient();

  const setListData = (
    updater: (page: TasksPage | undefined) => TasksPage | undefined
  ) => {
    qc.setQueryData<TasksPage>(tasksKeys.list(filters), updater);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: tasksKeys.all });

  const create = useMutation({
    mutationFn: (input: TaskInput) => createTask(input),
    onSuccess: (task) => {
      setListData((page) => prependTaskToPage(page, task));
      toast.success("Task created");
      void invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  /** Optimistic status flip — the core micro-interaction. */
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) =>
      updateTask(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: tasksKeys.list(filters) });
      const snapshot = qc.getQueryData<TasksPage>(tasksKeys.list(filters));
      setListData((page) => patchTaskInPage(page, id, { status }));
      return { snapshot, filtersKey: tasksKeys.list(filters) };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(ctx.filtersKey, ctx.snapshot);
      toast.error("Couldn't update — changes rolled back");
    },
    onSettled: invalidate,
  });

  const edit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> }) =>
      updateTask(id, patch),
    onSuccess: (task) => {
      // Refetch-faithful for edits (sort order can change).
      setListData((page) => patchTaskInPage(page, task._id, task));
      toast.success("Task updated");
      void invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  /** Optimistic remove → trash. Undo arrives with Phase 4. */
  const remove = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: tasksKeys.list(filters) });
      const snapshot = qc.getQueryData<TasksPage>(tasksKeys.list(filters));
      setListData((page) => removeTaskFromPage(page, id));
      return { snapshot, filtersKey: tasksKeys.list(filters) };
    },
    onSuccess: () => toast.success("Moved to trash"),
    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(ctx.filtersKey, ctx.snapshot);
      toast.error("Couldn't move to trash");
    },
    onSettled: invalidate,
  });

  return { create, setStatus, edit, remove };
}
