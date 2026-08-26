export const TASK_STATUSES = ["pending", "in_progress", "completed"] as const;

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export const RECURRENCES = ["daily", "weekly", "monthly"] as const;

export const ROLES = ["admin", "user"] as const;

export const QUEUES = {
  EMAILS: "emails",
  REMINDERS: "reminders",
  TRASH_CLEANUP: "trash-cleanup",
  WEBHOOKS: "webhooks",
} as const;

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.completed",
  "task.trashed",
  "test.ping",
] as const;

export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 10;

export const CACHE = {
  STATS_TTL_SECONDS: 60,
} as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type Recurrence = (typeof RECURRENCES)[number];

export type Role = (typeof ROLES)[number];

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
