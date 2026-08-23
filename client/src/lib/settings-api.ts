import { api } from "@/lib/api";

/* ── Sessions ─────────────────────────────────────────────── */

export interface SessionInfo {
  _id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt?: string;
}

export function listSessions() {
  return api<{ sessions: SessionInfo[] }>("/me/sessions");
}

export function revokeSession(sessionId: string) {
  return api<void>(`/me/sessions/${sessionId}`, { method: "DELETE" });
}

/* ── Two-factor ───────────────────────────────────────────── */

export function setup2fa() {
  return api<{ otpauthUri: string; qrDataUrl: string }>("/me/2fa/setup", {
    method: "POST",
  });
}

export function enable2fa(code: string) {
  return api<{ message?: string; recoveryCodes: string[] }>("/me/2fa/enable", {
    method: "POST",
    body: { code },
  });
}

export function disable2fa(input: { password?: string; code?: string }) {
  return api<{ message: string }>("/me/2fa/disable", {
    method: "POST",
    body: input,
  });
}

/* ── Password ─────────────────────────────────────────────── */

export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ message?: string }>("/me/password", {
    method: "PUT",
    body: { currentPassword, newPassword },
  });
}

/* ── Calendar feed ────────────────────────────────────────── */

export interface CalendarFeed {
  token: string;
  url: string;
}

export const getCalendarFeed = () => api<CalendarFeed>("/me/calendar-feed");
export const rotateCalendarFeed = () =>
  api<CalendarFeed>("/me/calendar-feed/rotate", { method: "POST" });

/* ── Webhooks ─────────────────────────────────────────────── */

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.completed",
  "task.trashed",
  "test.ping",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface Webhook {
  _id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  consecutiveFailures?: number;
  /** Returned on create (and list) — treated as sensitive. */
  secret?: string;
  createdAt: string;
}

const webhookSchemaBody = (url: string, events: WebhookEvent[]) => ({
  url,
  events,
});

export function listWebhooks() {
  return api<{ webhooks: Webhook[] }>("/me/webhooks");
}

export function createWebhook(url: string, events: WebhookEvent[]) {
  return api<Webhook>("/me/webhooks", {
    method: "POST",
    body: webhookSchemaBody(url, events),
  });
}

export function updateWebhook(
  id: string,
  patch: Partial<{ url: string; events: WebhookEvent[]; active: boolean }>
) {
  return api<Webhook>(`/me/webhooks/${id}`, { method: "PATCH", body: patch });
}

export function deleteWebhook(id: string) {
  return api<void>(`/me/webhooks/${id}`, { method: "DELETE" });
}

export function pingWebhook(id: string) {
  return api<{ queued: boolean }>(`/me/webhooks/${id}/ping`, {
    method: "POST",
  });
}
