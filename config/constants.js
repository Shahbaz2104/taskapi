// Central shared constants — single source of truth for enums,
// queue names, cache keys, and TTLs used across modules.

const TASK_STATUSES = ["pending", "in_progress", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high"];
const RECURRENCES = ["daily", "weekly", "monthly"];
const ROLES = ["admin", "user"];

const QUEUES = {
  EMAILS: "emails",
  REMINDERS: "reminders",
  TRASH_CLEANUP: "trash-cleanup",
  WEBHOOKS: "webhooks",
};

// Events that webhooks can subscribe to
const WEBHOOK_EVENTS = [
  "task.created",
  "task.completed",
  "task.trashed",
  "test.ping",
];

const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 10;

const CACHE = {
  STATS_TTL_SECONDS: 60,
};

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  RECURRENCES,
  ROLES,
  QUEUES,
  WEBHOOK_EVENTS,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  CACHE,
};
