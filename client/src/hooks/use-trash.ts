"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  bulkAction,
  emptyTrash,
  listTrash,
  type BulkAction,
  type TaskFilters,
  type TasksPage,
} from "@/lib/tasks-api";
import { removeTaskFromPage } from "@/hooks/use-tasks";

export const trashKeys = {
  all: ["trash"] as const,
  list: (filters: TaskFilters) => ["trash", "list", filters] as const,
};

export function useTrash(filters: TaskFilters) {
  return useQuery({
    queryKey: trashKeys.list(filters),
    queryFn: () => listTrash(filters),
    placeholderData: (prev) => prev,
  });
}

export function useTrashMutations(filters: TaskFilters) {
  const qc = useQueryClient();

  const invalidateWorld = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  };

  /** restore | purge — optimistic row removal from the current page. */
  const bulk = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkAction }) =>
      bulkAction(ids, action),
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: trashKeys.list(filters) });
      const snapshot = qc.getQueryData<TasksPage>(trashKeys.list(filters));
      qc.setQueryData<TasksPage>(trashKeys.list(filters), (page) => {
        let next = page;
        for (const id of ids) next = removeTaskFromPage(next, id);
        return next;
      });
      return { snapshot, key: trashKeys.list(filters) };
    },
    onSuccess: (_r, { action }) => {
      toast.success(action === "restore" ? "Task restored" : "Deleted forever");
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(ctx.key, ctx.snapshot);
      toast.error("Action failed — rolled back");
    },
    onSettled: invalidateWorld,
  });

  const clear = useMutation({
    mutationFn: emptyTrash,
    onSuccess: ({ deleted }) => {
      toast.success(
        `Trash emptied — ${deleted} task${deleted === 1 ? "" : "s"} gone`
      );
      qc.setQueryData<TasksPage>(trashKeys.list(filters), (page) =>
        page ? { ...page, tasks: [], total: 0, totalPages: 0 } : page
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't empty trash"),
    onSettled: invalidateWorld,
  });

  return { bulk, clear };
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const { getStats } = await import("@/lib/tasks-api");
      return getStats();
    },
    staleTime: 15_000,
  });
}
