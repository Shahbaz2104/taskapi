"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  changePassword,
  createWebhook,
  deleteWebhook,
  disable2fa,
  enable2fa,
  getCalendarFeed,
  listSessions,
  listWebhooks,
  pingWebhook,
  revokeSession,
  rotateCalendarFeed,
  setup2fa,
  updateWebhook,
  type WebhookEvent,
} from "@/lib/settings-api";

export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: listSessions });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      toast.success("Device signed out");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Revoke failed"),
  });
}

export function use2faSetup() {
  return useMutation({ mutationFn: setup2fa });
}

export function use2faEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enable2fa,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      // caller reads recoveryCodes from the response
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Invalid code"),
  });
}

export function use2faDisable(onDisabled: () => void) {
  return useMutation({
    mutationFn: disable2fa,
    onSuccess: () => {
      // Backend revokes tokens — force re-login.
      onDisabled();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't disable"),
  });
}

export function useChangePassword(onSuccessLogout: () => void) {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(current, next),
    onSuccess: () => {
      toast.success("Password changed — sign in with the new one");
      setTimeout(onSuccessLogout, 900);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Change failed"),
  });
}

export function useCalendarFeed() {
  return useQuery({ queryKey: ["calendar-feed"], queryFn: getCalendarFeed });
}

export function useRotateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rotateCalendarFeed,
    onSuccess: (feed) => {
      qc.setQueryData(["calendar-feed"], feed);
      toast.success("Feed URL rotated — old links are dead");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Rotate failed"),
  });
}

export function useWebhooks() {
  return useQuery({ queryKey: ["webhooks"], queryFn: listWebhooks });
}

export function useWebhookMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["webhooks"] });

  const create = useMutation({
    mutationFn: ({ url, events }: { url: string; events: WebhookEvent[] }) =>
      createWebhook(url, events),
    onSuccess: invalidate,
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{ url: string; events: WebhookEvent[]; active: boolean }>;
    }) => updateWebhook(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["webhooks"] });
      const snapshot = qc.getQueryData<{
        webhooks: Awaited<ReturnType<typeof listWebhooks>>["webhooks"];
      }>(["webhooks"]);
      qc.setQueryData(
        ["webhooks"],
        (data?: { webhooks: NonNullable<typeof snapshot>["webhooks"] }) =>
          data
            ? {
                webhooks: data.webhooks.map((w) =>
                  w._id === id ? { ...w, ...patch } : w
                ),
              }
            : data
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(["webhooks"], ctx.snapshot);
      toast.error("Update failed — rolled back");
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: deleteWebhook,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["webhooks"] });
      const snapshot = qc.getQueryData<{
        webhooks: Awaited<ReturnType<typeof listWebhooks>>["webhooks"];
      }>(["webhooks"]);
      qc.setQueryData(
        ["webhooks"],
        (data?: { webhooks: NonNullable<typeof snapshot>["webhooks"] }) =>
          data ? { webhooks: data.webhooks.filter((w) => w._id !== id) } : data
      );
      return { snapshot };
    },
    onSuccess: () => toast.success("Webhook deleted"),
    onError: (_e, _id, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(["webhooks"], ctx.snapshot);
      toast.error("Delete failed");
    },
    onSettled: invalidate,
  });

  const ping = useMutation({
    mutationFn: pingWebhook,
    onSuccess: ({ queued }) =>
      queued
        ? toast.success("Test delivery queued")
        : toast.warning("Queue offline — ping not sent"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ping failed"),
  });

  return { create, update, remove, ping };
}
