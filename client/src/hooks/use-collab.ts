"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addComment,
  createShare,
  getActivity,
  getTask,
  listComments,
  listShares,
  listSharedWithMe,
  revokeShare,
  type CollabComment,
} from "@/lib/collab-api";

export const collabKeys = {
  shares: (taskId: string) => ["shares", taskId] as const,
  comments: (taskId: string) => ["comments", taskId] as const,
  activity: (taskId: string) => ["activity", taskId] as const,
  sharedInbox: ["shared-inbox"] as const,
};

export function useTaskDetail(taskId: string) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
    retry: false,
  });
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: collabKeys.comments(taskId),
    queryFn: () => listComments(taskId),
  });
}

/** Optimistic prepend; reconciled by invalidation on settle. */
export function useAddComment(taskId: string, myUsername?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(taskId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: collabKeys.comments(taskId) });
      const snapshot = qc.getQueryData<{ comments: CollabComment[] }>(
        collabKeys.comments(taskId)
      );
      const optimistic: CollabComment = {
        _id: `temp-${Date.now()}`,
        body,
        user: { username: myUsername ?? "you" },
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<{ comments: CollabComment[] }>(
        collabKeys.comments(taskId),
        (data) => ({ comments: [optimistic, ...(data?.comments ?? [])] })
      );
      return { snapshot };
    },
    onError: (_e, _body, ctx) => {
      if (ctx?.snapshot)
        qc.setQueryData(collabKeys.comments(taskId), ctx.snapshot);
      toast.error("Couldn't post comment");
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: collabKeys.comments(taskId) }),
  });
}

export function useShares(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: collabKeys.shares(taskId),
    queryFn: () => listShares(taskId),
    enabled,
  });
}

export function useShareMutations(taskId: string) {
  const qc = useQueryClient();

  const grant = useMutation({
    mutationFn: ({
      username,
      role,
    }: {
      username: string;
      role: "viewer" | "editor";
    }) => createShare(taskId, username, role),
    onSuccess: () => {
      toast.success("Access granted");
      void qc.invalidateQueries({ queryKey: collabKeys.shares(taskId) });
      void qc.invalidateQueries({ queryKey: collabKeys.activity(taskId) });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't grant access"),
  });

  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeShare(taskId, shareId),
    onMutate: async (shareId) => {
      await qc.cancelQueries({ queryKey: collabKeys.shares(taskId) });
      const snapshot = qc.getQueryData<{
        shares: import("@/lib/collab-api").Share[];
      }>(collabKeys.shares(taskId));
      qc.setQueryData(
        collabKeys.shares(taskId),
        (data?: { shares: import("@/lib/collab-api").Share[] }) =>
          data
            ? { ...data, shares: data.shares.filter((s) => s._id !== shareId) }
            : data
      );
      return { snapshot };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot)
        qc.setQueryData(collabKeys.shares(taskId), ctx.snapshot);
      toast.error("Couldn't revoke");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: collabKeys.shares(taskId) });
      void qc.invalidateQueries({ queryKey: collabKeys.activity(taskId) });
    },
  });

  return { grant, revoke };
}

export function useActivity(taskId: string) {
  return useQuery({
    queryKey: collabKeys.activity(taskId),
    queryFn: () => getActivity(taskId),
  });
}

export function useSharedInbox() {
  return useQuery({
    queryKey: collabKeys.sharedInbox,
    queryFn: listSharedWithMe,
  });
}
