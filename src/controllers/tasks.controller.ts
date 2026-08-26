import type { RequestHandler } from "express";
import { Task, type TaskDocument } from "../models/task.js";
import * as tasksService from "../services/tasks.service.js";
import * as authService from "../services/auth.service.js";
import { emitTaskEvent } from "../services/webhooks.service.js";
import { capture } from "../services/analytics.service.js";
import { loadTaskWithAccess } from "../services/collab.service.js";
import { getClient, isAvailable } from "../config/redis.js";
import { currentUser } from "../middleware/auth.js";
import { AuthenticationError } from "../errors/index.js";

const STATS_CACHE_TTL = 60;

const invalidateStatsCache = async (userId: unknown): Promise<void> => {
  const client = getClient();
  if (!client) return;
  try {
    await client.del(`stats:${String(userId)}`);
  } catch {
    // cache invalidation is best-effort; never fail the request for it
  }
};

const parsePagination = (
  query: Record<string, unknown>,
  defaultLimit: number
): { page: number; limit: number } => ({
  page: Math.max(parseInt(query.page as string, 10) || 1, 1),
  limit: Math.min(
    Math.max(parseInt(query.limit as string, 10) || defaultLimit, 1),
    100
  ),
});

const getAllTasks: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const { page, limit } = parsePagination(req.query, 10);

  if (req.query.status !== undefined) {
    if (!tasksService.STATUSES.includes(req.query.status as never)) {
      res
        .status(400)
        .json({ error: "Status must be pending, in_progress or completed" });
      return;
    }
  }
  if (
    req.query.sort !== undefined &&
    !tasksService.parseSort(req.query.sort as string)
  ) {
    res
      .status(400)
      .json({ error: "Sort must be a valid field with optional - prefix" });
    return;
  }

  const result = await tasksService.listTasks({
    userId: auth.userId,
    page,
    limit,
    status: req.query.status as string | undefined,
    search: req.query.search as string | undefined,
    sort: req.query.sort as string | undefined,
  });
  res.status(200).json(result);
};

const getStats: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const cacheKey = `stats:${String(auth.userId)}`;
  const cacheClient = isAvailable() ? getClient() : null;
  if (cacheClient) {
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      res.status(200).json(JSON.parse(cached));
      return;
    }
  }

  const stats = await tasksService.getStats(auth.userId);
  if (cacheClient) {
    await cacheClient.set(
      cacheKey,
      JSON.stringify(stats),
      "EX",
      STATS_CACHE_TTL
    );
  }
  res.status(200).json(stats);
};

const exportTasksCsv: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const csv = await tasksService.exportTasks({
    userId: auth.userId,
    status: req.query.status as string | undefined,
  });
  const date = new Date().toISOString().slice(0, 10);
  res
    .status(200)
    .set("Content-Type", "text/csv")
    .set("Content-Disposition", `attachment; filename="tasks-${date}.csv"`)
    .send(csv);
};

const getAllTasksAdmin: RequestHandler = async (req, res) => {
  currentUser(req);
  const { page, limit } = parsePagination(req.query, 50);

  const [tasks, total] = await Promise.all([
    Task.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(),
  ]);
  res
    .status(200)
    .json({ tasks, total, page, limit, totalPages: Math.ceil(total / limit) });
};

const getTaskById: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const access = await loadTaskWithAccess({
    taskId: req.params.id as string,
    userId: auth.userId,
    minRole: "viewer",
  });
  if (!access) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.status(200).json(access.task);
};

interface TaskBody {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  tags?: string[] | null;
  recurrence?: string | null;
}

const createTask: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const { title, description, priority, dueDate, tags, recurrence } =
    req.body as TaskBody;
  const data: Record<string, unknown> = {
    title,
    description,
    priority,
    dueDate,
    tags,
    recurrence,
  };
  for (const key of Object.keys(data)) {
    if (data[key] == null) data[key] = undefined;
  }
  const result = await tasksService.createTask({
    userId: auth.userId,
    data,
    idempotencyKey: req.header("Idempotency-Key") ?? undefined,
  });
  if (result.replay) {
    res.status(result.statusCode ?? 200).json(result.task);
    return;
  }
  const task = result.task as TaskDocument;
  capture(auth.userId, "task_created", {
    priority: task.priority,
    hasDueDate: !!task.dueDate,
    recurring: !!task.recurrence,
  });
  void emitTaskEvent(auth.userId, "task.created", task);
  await invalidateStatsCache(auth.userId);
  res.status(201).json(task);
};

const updateTask: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const allowedUpdates = [
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "tags",
    "recurrence",
  ] as const;
  const body = req.body as TaskBody;
  const updates: Record<string, unknown> = {};
  for (const field of allowedUpdates) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null && (field === "status" || field === "priority"))
      continue;
    updates[field] = value === null && field === "tags" ? [] : value;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "At least one field to update is required" });
    return;
  }

  const access = await loadTaskWithAccess({
    taskId: req.params.id as string,
    userId: auth.userId,
    minRole: "editor",
  });
  if (!access) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const task = await tasksService.updateTask({
    taskId: req.params.id as string,
    userId: access.task.user,
    updates,
  });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.status(200).json(task);
};

const deleteTask: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const existing = await Task.findOne({
    _id: req.params.id,
    user: auth.userId,
    deletedAt: null,
  });
  const result = await tasksService.softDeleteTasks(auth.userId, [
    req.params.id as string,
  ]);
  if (result.modifiedCount === 0) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  capture(auth.userId, "task_trashed");
  if (existing) void emitTaskEvent(auth.userId, "task.trashed", existing);
  await invalidateStatsCache(auth.userId);
  res.status(204).send();
};

const bulkTasks: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const { ids, action, priority } = req.body as {
    ids: string[];
    action: string;
    priority?: string;
  };

  let result:
    | { matchedCount?: number; modifiedCount?: number; deletedCount?: number }
    | undefined;
  switch (action) {
    case "complete":
      result = await tasksService.bulkCompleteTasks(auth.userId, ids);
      break;
    case "trash":
      result = await tasksService.softDeleteTasks(auth.userId, ids);
      break;
    case "restore":
      result = await tasksService.restoreTasks(auth.userId, ids);
      break;
    case "purge":
      result = await tasksService.purgeTasks(auth.userId, ids);
      break;
    case "priority":
      result = await tasksService.bulkSetPriority(
        auth.userId,
        ids,
        priority as never
      );
      break;
    default:
      res.status(400).json({ error: "Unsupported bulk action" });
      return;
  }

  const matched = result.matchedCount ?? result.deletedCount ?? 0;
  const modified = result.modifiedCount ?? result.deletedCount ?? 0;
  capture(auth.userId, `bulk_${action}`, { count: modified });
  if (action !== "purge") await invalidateStatsCache(auth.userId);

  res.status(200).json({ action, matched, modified });
};

const listTrashedTasks: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const { page, limit } = parsePagination(req.query, 10);
  const result = await tasksService.listTrash({
    userId: auth.userId,
    page,
    limit,
  });
  res.status(200).json(result);
};

const clearTrash: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const result = await tasksService.emptyTrash(auth.userId);
  capture(auth.userId, "trash_emptied", {
    count: result.deletedCount,
  });
  res.status(200).json({ deleted: result.deletedCount });
};

const importTasks: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const contentType = req.headers["content-type"] || "";
  let rows: unknown;
  let source: string;

  if ((contentType as string).includes("text/csv")) {
    source = "csv";
    const text = typeof req.body === "string" ? req.body : "";
    const parsed = tasksService.parseCsvText(text);
    if (parsed.length < 2) {
      res.status(400).json({
        error: "CSV body requires a header row and at least one data row",
      });
      return;
    }
    rows = tasksService.csvRowsToObjects(parsed);
  } else {
    source = "json";
    rows = Array.isArray(req.body)
      ? req.body
      : (req.body as { tasks?: unknown } | undefined)?.tasks;
    if (!Array.isArray(rows)) {
      res.status(400).json({
        error: "Provide a JSON { tasks: [...] } payload or a text/csv body",
      });
      return;
    }
  }

  const result = await tasksService.importTasks({
    userId: auth.userId,
    rows,
    idempotencyKey: req.header("Idempotency-Key") ?? undefined,
  });

  if (result.replay) {
    res.status(200).json({
      imported: result.imported,
      failed: result.failed,
    });
    return;
  }

  capture(auth.userId, "tasks_imported", {
    source,
    imported: result.imported,
    failedCount: result.failed.length,
  });
  await invalidateStatsCache(auth.userId);
  res.status(200).json(result);
};

const getCalendarFeed: RequestHandler = async (req, res) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    throw new AuthenticationError("Feed token required");
  }
  const user = await authService.findUserByFeedToken(token);
  if (!user) {
    throw new AuthenticationError("Invalid feed token");
  }
  const ics = await tasksService.buildICalFeed(user._id);
  capture(String(user._id), "calendar_feed_viewed");
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", 'inline; filename="taskapi.ics"');
  res.status(200).send(ics);
};

export {
  getAllTasks,
  getStats,
  exportTasksCsv as exportTasks,
  getAllTasksAdmin,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  bulkTasks,
  listTrashedTasks,
  clearTrash,
  importTasks,
  getCalendarFeed,
};
