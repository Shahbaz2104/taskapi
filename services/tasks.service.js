const Task = require("../models/tasks_models.js");
const Idempotency = require("../models/idempotency_models.js");
const analytics = require("./analytics.service.js");

const STATUSES = ["pending", "in_progress", "completed"];
const SORT_FIELDS = ["createdAt", "updatedAt", "dueDate", "priority"];

const parseSort = (sort) => {
  if (!sort || !sort.trim()) return null;
  const direction = sort.startsWith("-") ? -1 : 1;
  const field = sort.replace(/^-/, "");
  return SORT_FIELDS.includes(field) ? { field, direction } : null;
};

const listTasks = async ({ userId, page, limit, status, search, sort }) => {
  const match = { user: userId };
  if (status && STATUSES.includes(status)) match.status = status;
  if (search) match.$text = { $search: search };

  const sortSpec = parseSort(sort) || { field: "createdAt", direction: -1 };
  const sortKey =
    sortSpec.field === "priority" ? "priorityRank" : sortSpec.field;

  const [result] = await Task.aggregate([
    { $match: match },
    {
      $addFields: {
        priorityRank: {
          $switch: {
            branches: [
              { case: { $eq: ["$priority", "high"] }, then: 3 },
              { case: { $eq: ["$priority", "medium"] }, then: 2 },
              { case: { $eq: ["$priority", "low"] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    },
    { $sort: { [sortKey]: sortSpec.direction, _id: sortSpec.direction } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const tasks = result.data;
  const total = result.total[0]?.count || 0;
  return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getStats = async (userId) => {
  const [result] = await Task.aggregate([
    { $match: { user: userId } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
        total: [{ $count: "count" }],
        overdue: [
          {
            $match: {
              status: { $ne: "completed" },
              dueDate: { $lt: new Date() },
            },
          },
          { $count: "count" },
        ],
      },
    },
  ]);

  const total = result.total[0]?.count || 0;
  const completed =
    result.byStatus.find((s) => s._id === "completed")?.count || 0;
  const statusCounts = Object.fromEntries(
    result.byStatus.map((s) => [s._id, s.count])
  );
  const priorityCounts = Object.fromEntries(
    result.byPriority.map((s) => [s._id, s.count])
  );

  return {
    total,
    byStatus: { pending: 0, in_progress: 0, completed: 0, ...statusCounts },
    byPriority: { low: 0, medium: 0, high: 0, ...priorityCounts },
    overdue: result.overdue[0]?.count || 0,
    completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
  };
};

const csvEscape = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportTasks = async ({ userId, status }) => {
  const filter = { user: userId };
  if (status && STATUSES.includes(status)) filter.status = status;

  const tasks = await Task.find(filter).sort({ createdAt: -1 }).lean();
  const header = [
    "_id",
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "tags",
    "createdAt",
    "updatedAt",
  ];
  const rows = tasks.map((t) => [
    t._id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.dueDate ? t.dueDate.toISOString() : "",
    (t.tags || []).join(";"),
    t.createdAt.toISOString(),
    t.updatedAt.toISOString(),
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
};

const nextDueDate = (base, recurrence) => {
  const d = base ? new Date(base) : new Date();
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
};

const updateTask = async ({ taskId, userId, updates }) => {
  const existing = await Task.findOne({ _id: taskId, user: userId });
  if (!existing) return null;

  // Completing a recurring task spawns the next occurrence
  if (
    updates.status === "completed" &&
    existing.status !== "completed" &&
    existing.recurrence
  ) {
    await Task.create({
      title: existing.title,
      description: existing.description,
      status: "pending",
      priority: existing.priority,
      dueDate: nextDueDate(existing.dueDate || new Date(), existing.recurrence),
      tags: existing.tags,
      recurrence: existing.recurrence,
      user: userId,
    });
  }

  if (updates.status === "completed" && existing.status !== "completed") {
    analytics.capture(userId, "task_completed", {
      recurring: !!existing.recurrence,
    });
  }

  return Task.findOneAndUpdate({ _id: taskId, user: userId }, updates, {
    returnDocument: "after",
    runValidators: true,
  });
};

const createTask = async ({ userId, data, idempotencyKey }) => {
  if (idempotencyKey) {
    let record;
    try {
      record = await Idempotency.create({
        user: userId,
        key: idempotencyKey,
        statusCode: 201,
        body: null,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Same key in flight (or replayed) — return the stored response
        const existing = await Idempotency.findOne({
          user: userId,
          key: idempotencyKey,
        });
        if (existing && existing.body) {
          return {
            task: existing.body,
            statusCode: existing.statusCode,
            replay: true,
          };
        }
        throw Object.assign(new Error("Idempotent request in progress"), {
          status: 409,
        });
      }
      throw err;
    }

    const task = await Task.create({ ...data, user: userId });
    record.statusCode = 201;
    record.body = task;
    await record.save();
    return { task };
  }

  return { task: await Task.create({ ...data, user: userId }) };
};

module.exports = {
  listTasks,
  getStats,
  exportTasks,
  updateTask,
  createTask,
  nextDueDate,
  parseSort,
  STATUSES,
  SORT_FIELDS,
};
