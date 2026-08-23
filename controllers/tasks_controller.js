const Task = require("../models/tasks_models.js");
const tasksService = require("../services/tasks.service.js");
const authService = require("../services/auth.service.js");
const webhooks = require("../services/webhooks.service.js");
const analytics = require("../services/analytics.service.js");
const { isAvailable, getClient } = require("../config/redis");

const STATS_CACHE_TTL = 60;

// Keep /tasks/stats honest after mutations instead of serving up to 60s
// of stale numbers (audit FIND-005)
const invalidateStatsCache = async (userId) => {
  if (!isAvailable()) return;
  try {
    await getClient().del(`stats:${userId}`);
  } catch {
    // cache invalidation is best-effort; never fail the request for it
  }
};

/**
 * @swagger
 * /tasks:
 *   get:
 *     summary: List your tasks (paginated, filterable, searchable, sortable)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 }, description: Page number (1-based) }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 10 }, description: Results per page }
 *       - { name: status, in: query, schema: { type: string, enum: [pending, in_progress, completed] }, description: Filter by status }
 *       - { name: search, in: query, schema: { type: string }, description: Full-text search across title and description }
 *       - { name: sort, in: query, schema: { type: string, enum: [createdAt, -createdAt, updatedAt, -updatedAt, dueDate, -dueDate, priority, -priority] }, description: Sort field, prefix - for descending }
 *     responses:
 *       200:
 *         description: Paginated task list
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/TaskList" }
 *       400:
 *         description: Invalid status or sort
 *       401:
 *         description: Missing or invalid token
 */
const getAllTasks = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

  if (req.query.status !== undefined) {
    if (!tasksService.STATUSES.includes(req.query.status)) {
      return res
        .status(400)
        .json({ error: "Status must be pending, in_progress or completed" });
    }
  }
  if (req.query.sort !== undefined && !tasksService.parseSort(req.query.sort)) {
    return res
      .status(400)
      .json({ error: "Sort must be a valid field with optional - prefix" });
  }

  const result = await tasksService.listTasks({
    userId: req.user.userId,
    page,
    limit,
    status: req.query.status,
    search: req.query.search,
    sort: req.query.sort,
  });
  res.status(200).json(result);
};

/**
 * @swagger
 * /tasks/stats:
 *   get:
 *     summary: Task statistics (counts by status/priority, overdue, completion rate)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Aggregated stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 byStatus: { type: object }
 *                 byPriority: { type: object }
 *                 overdue: { type: integer }
 *                 completionRate: { type: number }
 *       401:
 *         description: Missing or invalid token
 */
const getStats = async (req, res) => {
  const cacheKey = `stats:${req.user.userId}`;
  if (isAvailable()) {
    const cached = await getClient().get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));
  }

  const stats = await tasksService.getStats(req.user.userId);
  if (isAvailable()) {
    await getClient().set(
      cacheKey,
      JSON.stringify(stats),
      "EX",
      STATS_CACHE_TTL
    );
  }
  res.status(200).json(stats);
};

/**
 * @swagger
 * /tasks/export:
 *   get:
 *     summary: Export your tasks as CSV
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [pending, in_progress, completed] }, description: Filter by status }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       401:
 *         description: Missing or invalid token
 */
const exportTasks = async (req, res) => {
  const csv = await tasksService.exportTasks({
    userId: req.user.userId,
    status: req.query.status,
  });
  const date = new Date().toISOString().slice(0, 10);
  res
    .status(200)
    .set("Content-Type", "text/csv")
    .set("Content-Disposition", `attachment; filename="tasks-${date}.csv"`)
    .send(csv);
};

/**
 * @swagger
 * /tasks/all:
 *   get:
 *     summary: List every user's tasks (admin only)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
 *     responses:
 *       200:
 *         description: Paginated tasks across all users
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
const getAllTasksAdmin = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

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

/**
 * @swagger
 * /tasks/{id}:
 *   get:
 *     summary: Get one of your tasks
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     responses:
 *       200:
 *         description: The task
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const getTaskById = async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    user: req.user.userId,
    deletedAt: null,
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(200).json(task);
};

/**
 * @swagger
 * /tasks:
 *   post:
 *     summary: Create a task (idempotent with Idempotency-Key header)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: Idempotency-Key, in: header, schema: { type: string }, description: Optional key — retries with the same key return the original response }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, maxLength: 200, example: "Write audit report" }
 *               description: { type: string, maxLength: 2000, example: "Document all findings" }
 *               priority: { type: string, enum: [low, medium, high] }
 *               dueDate: { type: string, format: date-time, example: "2026-09-01T12:00:00.000Z" }
 *               tags: { type: array, maxItems: 5, items: { type: string, maxLength: 30 } }
 *               recurrence: { type: string, enum: [daily, weekly, monthly], nullable: true }
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Missing or invalid token
 */
const createTask = async (req, res) => {
  const { title, description, priority, dueDate, tags, recurrence } = req.body;
  const data = { title, description, priority, dueDate, tags, recurrence };
  for (const key of Object.keys(data)) {
    if (data[key] == null) delete data[key];
  }
  const result = await tasksService.createTask({
    userId: req.user.userId,
    data: { title, description, priority, dueDate, tags, recurrence },
    idempotencyKey: req.header("Idempotency-Key"),
  });
  if (result.replay) return res.status(result.statusCode).json(result.task);
  analytics.capture(req.user.userId, "task_created", {
    priority: result.task.priority,
    hasDueDate: !!result.task.dueDate,
    recurring: !!result.task.recurrence,
  });
  webhooks.emitTaskEvent(req.user.userId, "task.created", result.task);
  await invalidateStatsCache(req.user.userId);
  res.status(201).json(result.task);
};

/**
 * @swagger
 * /tasks/{id}:
 *   put:
 *     summary: Update a task (at least one field)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 200 }
 *               description: { type: string, maxLength: 2000 }
 *               status: { type: string, enum: [pending, in_progress, completed] }
 *               priority: { type: string, enum: [low, medium, high] }
 *               dueDate: { type: string, format: date-time, nullable: true }
 *               tags: { type: array, maxItems: 5, items: { type: string, maxLength: 30 } }
 *               recurrence: { type: string, enum: [daily, weekly, monthly], nullable: true }
 *     responses:
 *       200:
 *         description: Updated task
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid input or empty update body
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const updateTask = async (req, res) => {
  const allowedUpdates = [
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "tags",
    "recurrence",
  ];
  const updates = {};
  for (const field of allowedUpdates) {
    const value = req.body[field];
    if (value === undefined) continue;
    // null clears dueDate/recurrence/tags but is invalid for status/priority
    if (value === null && (field === "status" || field === "priority"))
      continue;
    updates[field] = value === null && field === "tags" ? [] : value;
  }
  if (Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ error: "At least one field to update is required" });
  }

  const task = await tasksService.updateTask({
    taskId: req.params.id,
    userId: req.user.userId,
    updates,
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(200).json(task);
};

/**
 * @swagger
 * /tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const deleteTask = async (req, res) => {
  // Soft delete — lands in /tasks/trash and is purged after retention
  const existing = await Task.findOne({
    _id: req.params.id,
    user: req.user.userId,
    deletedAt: null,
  });
  const result = await tasksService.softDeleteTasks(req.user.userId, [
    req.params.id,
  ]);
  if (result.modifiedCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }
  analytics.capture(req.user.userId, "task_trashed");
  webhooks.emitTaskEvent(req.user.userId, "task.trashed", existing);
  await invalidateStatsCache(req.user.userId);
  res.status(204).send();
};

/**
 * @swagger
 * /tasks/bulk:
 *   patch:
 *     summary: Apply one action to many of your live tasks
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, action]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items: { type: string }
 *               action:
 *                 type: string
 *                 enum: [complete, trash, restore, purge, priority]
 *                 description: |
 *                   complete: mark pending/in_progress tasks completed (no recurrence spawning).
 *                   trash: soft-delete. restore: bring back from trash.
 *                   purge: permanently delete trashed tasks. priority: set priority (required).
 *               priority: { type: string, enum: [low, medium, high], description: Required when action=priority }
 *     responses:
 *       200:
 *         description: Counts of tasks matched and modified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 action: { type: string }
 *                 matched: { type: integer }
 *                 modified: { type: integer }
 *       400:
 *         description: Invalid ids, action, or missing priority
 *       401:
 *         description: Missing or invalid token
 */
const bulkTasks = async (req, res) => {
  const { ids, action, priority } = req.body;

  let result;
  switch (action) {
    case "complete":
      result = await tasksService.bulkCompleteTasks(req.user.userId, ids);
      break;
    case "trash":
      result = await tasksService.softDeleteTasks(req.user.userId, ids);
      break;
    case "restore":
      result = await tasksService.restoreTasks(req.user.userId, ids);
      break;
    case "purge":
      result = await tasksService.purgeTasks(req.user.userId, ids);
      break;
    case "priority":
      result = await tasksService.bulkSetPriority(
        req.user.userId,
        ids,
        priority
      );
      break;
    default:
      return res.status(400).json({ error: "Unsupported bulk action" });
  }

  const matched = result.matchedCount ?? result.deletedCount ?? 0;
  const modified = result.modifiedCount ?? result.deletedCount ?? 0;
  analytics.capture(req.user.userId, `bulk_${action}`, { count: modified });
  if (action !== "purge") await invalidateStatsCache(req.user.userId);

  res.status(200).json({ action, matched, modified });
};

/**
 * @swagger
 * /tasks/trash:
 *   get:
 *     summary: List your trashed tasks (newest deletion first)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated trashed tasks
 *       401:
 *         description: Missing or invalid token
 */
const listTrashedTasks = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const result = await tasksService.listTrash({
    userId: req.user.userId,
    page,
    limit,
  });
  res.status(200).json(result);
};

/**
 * @swagger
 * /tasks/trash:
 *   delete:
 *     summary: Permanently empty your trash
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Number of tasks permanently deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: integer }
 *       401:
 *         description: Missing or invalid token
 */
const clearTrash = async (req, res) => {
  const result = await tasksService.emptyTrash(req.user.userId);
  analytics.capture(req.user.userId, "trash_emptied", {
    count: result.deletedCount,
  });
  res.status(200).json({ deleted: result.deletedCount });
};

/**
 * @swagger
 * /tasks/import:
 *   post:
 *     summary: Import tasks from a JSON array or raw CSV (idempotent)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: Idempotency-Key, in: header, schema: { type: string }, description: Optional key — retries with the same key replay the original response }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tasks:
 *                 type: array
 *                 maxItems: 500
 *                 items:
 *                   type: object
 *                   required: [title]
 *                   properties:
 *                     title: { type: string }
 *                     description: { type: string }
 *                     status: { type: string, enum: [pending, in_progress, completed] }
 *                     priority: { type: string, enum: [low, medium, high] }
 *                     dueDate: { type: string, format: date-time }
 *                     tags: { type: array, items: { type: string } }
 *                     recurrence: { type: string, enum: [daily, weekly, monthly] }
 *         text/csv:
 *           schema: { type: string }
 *           example: "title,status,priority,tags\nPay rent,pending,high,finance;monthly"
 *     responses:
 *       200:
 *         description: Partial-success import report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imported: { type: integer }
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row: { type: integer }
 *                       error: { type: string }
 *       400:
 *         description: Empty payload or over the 500-row limit
 */
const importTasks = async (req, res) => {
  const contentType = req.headers["content-type"] || "";
  let rows;
  let source;

  if (contentType.includes("text/csv")) {
    source = "csv";
    const text = typeof req.body === "string" ? req.body : "";
    const parsed = tasksService.parseCsvText(text);
    if (parsed.length < 2) {
      return res.status(400).json({
        error: "CSV body requires a header row and at least one data row",
      });
    }
    rows = tasksService.csvRowsToObjects(parsed);
  } else {
    source = "json";
    rows = Array.isArray(req.body) ? req.body : req.body?.tasks;
    if (!Array.isArray(rows)) {
      return res.status(400).json({
        error: "Provide a JSON { tasks: [...] } payload or a text/csv body",
      });
    }
  }

  const result = await tasksService.importTasks({
    userId: req.user.userId,
    rows,
    idempotencyKey: req.header("Idempotency-Key"),
  });

  if (result.replay) {
    return res.status(200).json({
      imported: result.imported,
      failed: result.failed,
    });
  }

  analytics.capture(req.user.userId, "tasks_imported", {
    source,
    imported: result.imported,
    failedCount: result.failed.length,
  });
  await invalidateStatsCache(req.user.userId);
  res.status(200).json(result);
};

/**
 * @swagger
 * /tasks/calendar.ics:
 *   get:
 *     summary: Public iCal feed of your tasks (token-authenticated, no JWT)
 *     tags: [Tasks]
 *     parameters:
 *       - { name: token, in: query, required: true, schema: { type: string }, description: Feed token from GET /me/calendar-feed }
 *     responses:
 *       200:
 *         description: VCALENDAR document containing all non-deleted tasks
 *         content:
 *           text/calendar:
 *             schema: { type: string }
 *       401:
 *         description: Missing or invalid feed token
 */
const getCalendarFeed = async (req, res) => {
  const token = req.query.token;
  if (!token) {
    throw Object.assign(new Error("Feed token required"), { status: 401 });
  }
  const user = await authService.findUserByFeedToken(token);
  if (!user) {
    throw Object.assign(new Error("Invalid feed token"), { status: 401 });
  }
  const ics = await tasksService.buildICalFeed(user._id);
  analytics.capture(String(user._id), "calendar_feed_viewed");
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", 'inline; filename="taskapi.ics"');
  res.status(200).send(ics);
};

module.exports = {
  getAllTasks,
  getStats,
  exportTasks,
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
