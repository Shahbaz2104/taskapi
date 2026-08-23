// Central shared constants — single source of truth for enums,
// queue names, cache keys, and TTLs used across modules.

const TASK_STATUSES = ["pending", "in_progress", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high"];
const RECURRENCES = ["daily", "weekly", "monthly"];
const ROLES = ["admin", "user"];

const QUEUES = {
  EMAILS: "emails",
  REMINDERS: "reminders",
};

const CACHE = {
  STATS_TTL_SECONDS: 60,
};

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  RECURRENCES,
  ROLES,
  QUEUES,
  CACHE,
};
