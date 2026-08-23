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
  const match = { user: userId, deletedAt: null };
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
    { $match: { user: userId, deletedAt: null } },
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
  const filter = { user: userId, deletedAt: null };
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
  const existing = await Task.findOne({
    _id: taskId,
    user: userId,
    deletedAt: null,
  });
  if (!existing) return null;

  // Completing is a one-way transition guarded inside the update filter,
  // so two concurrent completions cannot both win the spawn race
  const completing = updates.status === "completed";
  const updated = await Task.findOneAndUpdate(
    {
      _id: taskId,
      user: userId,
      deletedAt: null,
      ...(completing ? { status: { $ne: "completed" } } : {}),
    },
    updates,
    { returnDocument: "after", runValidators: true }
  );

  if (!updated) {
    // Lost the completion race (another request completed it first) —
    // the task still exists, so surface its current state
    return Task.findOne({ _id: taskId, user: userId, deletedAt: null });
  }

  // Winner of a completion on a recurring task spawns the next occurrence
  if (completing && existing.status !== "completed") {
    if (existing.recurrence) {
      await Task.create({
        title: existing.title,
        description: existing.description,
        status: "pending",
        priority: existing.priority,
        dueDate: nextDueDate(
          existing.dueDate || new Date(),
          existing.recurrence
        ),
        tags: existing.tags,
        recurrence: existing.recurrence,
        user: userId,
      });
    }
    analytics.capture(userId, "task_completed", {
      recurring: !!existing.recurrence,
    });
  }

  return updated;
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

// --- Bulk operations & trash ---

const BULK_ACTIONS = ["complete", "trash", "restore", "purge", "priority"];

const softDeleteTasks = (userId, ids) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

const restoreTasks = (userId, ids) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } }
  );

const purgeTasks = (userId, ids) =>
  Task.deleteMany({
    _id: { $in: ids },
    user: userId,
    deletedAt: { $ne: null },
  });

const emptyTrash = (userId) =>
  Task.deleteMany({ user: userId, deletedAt: { $ne: null } });

// Bulk complete intentionally does NOT spawn recurring successors —
// a 50-task selection must not silently create 50 follow-ups
const bulkCompleteTasks = (userId, ids) =>
  Task.updateMany(
    {
      _id: { $in: ids },
      user: userId,
      deletedAt: null,
      status: { $ne: "completed" },
    },
    { $set: { status: "completed" } }
  );

const bulkSetPriority = (userId, ids, priority) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: null },
    { $set: { priority } }
  );

const listTrash = async ({ userId, page, limit }) => {
  const filter = { user: userId, deletedAt: { $ne: null } };
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ deletedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);
  return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// --- Import (JSON / CSV) ---

const MAX_IMPORT_ROWS = 500;
const PRIORITIES = ["low", "medium", "high"];
const RECURRENCES = ["daily", "weekly", "monthly"];

// RFC 4180-style parser: quoted fields, "" escapes, embedded newlines,
// CRLF or LF records. Returns an array of raw field arrays.
const parseCsvText = (text) => {
  const src = String(text).replace(/^\uFEFF/, ""); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
  }
  return rows;
};

const CSV_HEADER_ALIASES = {
  title: "title",
  name: "title",
  description: "description",
  desc: "description",
  status: "status",
  priority: "priority",
  duedate: "dueDate",
  due_date: "dueDate",
  due: "dueDate",
  tags: "tags",
  labels: "tags",
};

// Maps parsed CSV rows onto task-shaped objects using the header row
const csvRowsToObjects = (rows) => {
  const [header, ...dataRows] = rows;
  const keys = header.map((h) => CSV_HEADER_ALIASES[h.trim().toLowerCase()]);
  return dataRows.map((fields) => {
    const obj = {};
    keys.forEach((key, i) => {
      if (key && fields[i] !== undefined && String(fields[i]).trim() !== "") {
        obj[key] = fields[i].trim();
      }
    });
    return obj;
  });
};

// Validates one imported row → { doc } or { error }; mirrors the Task
// model constraints (title ≤200, description ≤2000, ≤5 tags)
const normalizeImportRow = (raw) => {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { error: "title is required" };
  if (title.length > 200) return { error: "title exceeds 200 characters" };

  const doc = { title };

  const description =
    raw.description == null ? "" : String(raw.description).trim();
  if (description.length > 2000) {
    return { error: "description exceeds 2000 characters" };
  }
  if (description) doc.description = description;

  if (raw.status != null && raw.status !== "") {
    if (!STATUSES.includes(raw.status))
      return { error: `invalid status "${raw.status}"` };
    doc.status = raw.status;
  }

  if (raw.priority != null && raw.priority !== "") {
    if (!PRIORITIES.includes(raw.priority)) {
      return { error: `invalid priority "${raw.priority}"` };
    }
    doc.priority = raw.priority;
  }

  if (raw.dueDate != null && raw.dueDate !== "") {
    const d = new Date(raw.dueDate);
    if (Number.isNaN(d.getTime())) {
      return { error: `invalid dueDate "${raw.dueDate}"` };
    }
    doc.dueDate = d;
  }

  if (raw.recurrence != null && raw.recurrence !== "") {
    if (!RECURRENCES.includes(raw.recurrence)) {
      return { error: `invalid recurrence "${raw.recurrence}"` };
    }
    doc.recurrence = raw.recurrence;
  }

  let tags = raw.tags;
  if (typeof tags === "string") {
    tags = tags.split(/[;,]/);
  }
  if (tags != null && !Array.isArray(tags)) {
    return { error: "tags must be an array or semicolon-delimited string" };
  }
  if (Array.isArray(tags)) {
    const clean = [
      ...new Set(tags.map((t) => String(t).trim()).filter(Boolean)),
    ];
    if (clean.length > 5) return { error: "at most 5 tags per task" };
    if (clean.length > 0) doc.tags = clean;
  }

  return { doc };
};

// Bulk import with per-row partial success. Reuses the Mongo Idempotency
// collection (same contract as createTask): a repeated Idempotency-Key
// replays the original { imported, failed } response.
const importTasks = async ({ userId, rows, idempotencyKey }) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("No importable rows provided"), {
      status: 400,
    });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw Object.assign(
      new Error(`Import limited to ${MAX_IMPORT_ROWS} rows per request`),
      { status: 400 }
    );
  }

  let record = null;
  if (idempotencyKey) {
    try {
      record = await Idempotency.create({
        user: userId,
        key: idempotencyKey,
        statusCode: 200,
        body: null,
      });
    } catch (err) {
      if (err.code === 11000) {
        const existing = await Idempotency.findOne({
          user: userId,
          key: idempotencyKey,
        });
        if (existing && existing.body) {
          return { ...existing.body, replay: true };
        }
        throw Object.assign(new Error("Idempotent request in progress"), {
          status: 409,
        });
      }
      throw err;
    }
  }

  const docs = [];
  const failed = [];
  rows.forEach((raw, index) => {
    const outcome = normalizeImportRow(raw || {});
    if (outcome.error) failed.push({ row: index, error: outcome.error });
    else docs.push({ ...outcome.doc, user: userId });
  });

  const inserted = docs.length > 0 ? await Task.insertMany(docs) : [];
  const result = { imported: inserted.length, failed };

  if (record) {
    record.body = result;
    await record.save();
  }
  return result;
};

// --- iCal calendar feed (RFC 5545) ---

const formatICalDate = (date) =>
  new Date(date)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

// Escape text values per RFC 5545 §3.3.11
const icalEscape = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// Fold content lines longer than 75 octets (RFC 5545 §3.1)
const foldICalLine = (line) => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    parts.push(` ${line.slice(i, i + 74)}`);
  }
  return parts.join("\r\n");
};

const buildICalFeed = async (userId) => {
  const tasks = await Task.find({ user: userId, deletedAt: null })
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TaskAPI//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const t of tasks) {
    // Tasks without a due date anchor at creation time so they still
    // appear on the calendar
    const start = t.dueDate ? new Date(t.dueDate) : new Date(t.createdAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t._id}@taskapi`,
      `DTSTAMP:${formatICalDate(new Date())}`,
      `DTSTART:${formatICalDate(start)}`,
      `DTEND:${formatICalDate(end)}`,
      `SUMMARY:${icalEscape(t.title)}`
    );
    if (t.description) {
      lines.push(`DESCRIPTION:${icalEscape(t.description)}`);
    }
    lines.push(
      `STATUS:${t.status === "completed" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldICalLine).join("\r\n") + "\r\n";
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
  BULK_ACTIONS,
  softDeleteTasks,
  restoreTasks,
  purgeTasks,
  emptyTrash,
  bulkCompleteTasks,
  bulkSetPriority,
  listTrash,
  MAX_IMPORT_ROWS,
  parseCsvText,
  csvRowsToObjects,
  normalizeImportRow,
  importTasks,
  formatICalDate,
  icalEscape,
  foldICalLine,
  buildICalFeed,
};
