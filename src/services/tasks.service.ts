import type { Types, UpdateQuery } from "mongoose";
import { Task, type TaskDocument } from "../models/task.js";
import { Idempotency } from "../models/idempotency.js";
import { capture } from "./analytics.service.js";
import { emitTaskEvent } from "./webhooks.service.js";
import { ConflictError, ValidationError } from "../errors/index.js";
import {
  RECURRENCES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Recurrence,
  type TaskPriority,
  type TaskStatus,
} from "../config/constants.js";

type Id = string | Types.ObjectId;

const STATUSES = TASK_STATUSES;
const BULK_ACTIONS = [
  "complete",
  "trash",
  "restore",
  "purge",
  "priority",
] as const;
const SORT_FIELDS = ["createdAt", "updatedAt", "dueDate", "priority"] as const;

type SortField = (typeof SORT_FIELDS)[number];
type BulkAction = (typeof BULK_ACTIONS)[number];

const includesValue = (list: readonly string[], value: unknown): boolean =>
  list.includes(value as string);

const compact = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
};

const isDuplicateKeyError = (err: unknown): boolean =>
  err instanceof Error && (err as { code?: unknown }).code === 11000;

const parseSort = (
  sort?: string | null
): { field: SortField; direction: 1 | -1 } | null => {
  if (!sort || !sort.trim()) return null;
  const direction = sort.startsWith("-") ? -1 : 1;
  const field = sort.replace(/^-/, "") as SortField;
  return (SORT_FIELDS as readonly string[]).includes(field)
    ? { field, direction }
    : null;
};

interface AggTask {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  tags?: string[];
  recurrence?: Recurrence | null;
  reminderSent?: boolean;
  deletedAt?: Date | null;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  priorityRank?: number;
}

interface ListFacetRow {
  data: AggTask[];
  total: { count: number }[];
}

interface TaskList {
  tasks: AggTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ListParams {
  userId: Id;
  page: number;
  limit: number;
  status?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
}

const listTasks = async ({
  userId,
  page,
  limit,
  status,
  search,
  sort,
}: ListParams): Promise<TaskList> => {
  const match: Record<string, unknown> = { user: userId, deletedAt: null };
  if (status && includesValue(TASK_STATUSES, status)) match.status = status;
  if (search) match.$text = { $search: search };

  const sortSpec = parseSort(sort) || {
    field: "createdAt" as SortField,
    direction: -1 as const,
  };
  const sortKey =
    sortSpec.field === "priority" ? "priorityRank" : sortSpec.field;

  const rows = await Task.aggregate<ListFacetRow>([
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

  const result = rows[0];
  if (!result) {
    return { tasks: [], total: 0, page, limit, totalPages: 0 };
  }

  const total = result.total[0]?.count || 0;
  return {
    tasks: result.data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

interface StatsFacetRow {
  byStatus: { _id: string; count: number }[];
  byPriority: { _id: string; count: number }[];
  total: { count: number }[];
  overdue: { count: number }[];
}

interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
  completionRate: number;
}

const getStats = async (userId: Id): Promise<TaskStats> => {
  const rows = await Task.aggregate<StatsFacetRow>([
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

  const result = rows[0];
  if (!result) {
    return {
      total: 0,
      byStatus: { pending: 0, in_progress: 0, completed: 0 },
      byPriority: { low: 0, medium: 0, high: 0 },
      overdue: 0,
      completionRate: 0,
    };
  }

  const total = result.total[0]?.count || 0;
  const completed =
    result.byStatus.find((s) => s._id === "completed")?.count || 0;
  const statusCounts = Object.fromEntries(
    result.byStatus.map((s) => [String(s._id), s.count])
  );
  const priorityCounts = Object.fromEntries(
    result.byPriority.map((s) => [String(s._id), s.count])
  );

  return {
    total,
    byStatus: { pending: 0, in_progress: 0, completed: 0, ...statusCounts },
    byPriority: { low: 0, medium: 0, high: 0, ...priorityCounts },
    overdue: result.overdue[0]?.count || 0,
    completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
  };
};

const csvEscape = (value: unknown): string => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface ExportParams {
  userId: Id;
  status?: string | undefined;
}

const exportTasks = async ({
  userId,
  status,
}: ExportParams): Promise<string> => {
  const filter: Record<string, unknown> = { user: userId, deletedAt: null };
  if (status && includesValue(TASK_STATUSES, status)) filter.status = status;

  const tasks = (await Task.find(filter)
    .sort({ createdAt: -1 })
    .lean()) as unknown as AggTask[];

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
  const csvRows = tasks.map((t) => [
    t._id,
    t.title,
    t.description ?? "",
    t.status,
    t.priority,
    t.dueDate ? t.dueDate.toISOString() : "",
    (t.tags ?? []).join(";"),
    t.createdAt.toISOString(),
    t.updatedAt.toISOString(),
  ]);
  return [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\n");
};

const nextDueDate = (
  base: Date | string | null | undefined,
  recurrence: Recurrence
): Date => {
  const d = base ? new Date(base) : new Date();
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
};

type TaskUpdateShape = {
  [K in keyof Omit<AggTask, "_id" | "user" | "createdAt" | "updatedAt">]?:
    AggTask[K] | null | undefined;
};

interface UpdateTaskParams {
  taskId: Id;
  userId: Id;
  updates: UpdateQuery<TaskUpdateShape>;
}

const updateTask = async ({
  taskId,
  userId,
  updates,
}: UpdateTaskParams): Promise<TaskDocument | null> => {
  const existing = await Task.findOne({
    _id: taskId,
    user: userId,
    deletedAt: null,
  });
  if (!existing) return null;

  const completing = (updates as { status?: unknown }).status === "completed";
  const updated = (await Task.findOneAndUpdate(
    {
      _id: taskId,
      user: userId,
      deletedAt: null,
      ...(completing ? { status: { $ne: "completed" } } : {}),
    },
    updates,
    { returnDocument: "after", runValidators: true }
  )) as TaskDocument | null;

  if (!updated) {
    return Task.findOne({ _id: taskId, user: userId, deletedAt: null });
  }

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
    capture(userId, "task_completed", {
      recurring: !!existing.recurrence,
    });
    await emitTaskEvent(userId, "task.completed", updated);
  }

  return updated;
};

interface CreateTaskParams {
  userId: Id;
  data: Record<string, unknown>;
  idempotencyKey?: string | undefined;
}

interface CreateTaskResult {
  task: unknown;
  statusCode?: number | null | undefined;
  replay?: boolean;
}

const createTask = async ({
  userId,
  data,
  idempotencyKey,
}: CreateTaskParams): Promise<CreateTaskResult> => {
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
      if (isDuplicateKeyError(err)) {
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
        throw new ConflictError("Idempotent request in progress");
      }
      throw err;
    }

    const task = (await Task.create(
      compact({ ...data, user: userId }) as never
    )) as unknown as AggTask & { toObject(): Record<string, unknown> };
    record.statusCode = 201;
    record.body = task.toObject() as Record<string, unknown>;
    await record.save();
    return { task };
  }

  return {
    task: await Task.create(compact({ ...data, user: userId }) as never),
  };
};

const softDeleteTasks = (userId: Id, ids: Id[]) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

const restoreTasks = (userId: Id, ids: Id[]) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } }
  );

const purgeTasks = (userId: Id, ids: Id[]) =>
  Task.deleteMany({
    _id: { $in: ids },
    user: userId,
    deletedAt: { $ne: null },
  });

const emptyTrash = (userId: Id) =>
  Task.deleteMany({ user: userId, deletedAt: { $ne: null } });

const bulkCompleteTasks = (userId: Id, ids: Id[]) =>
  Task.updateMany(
    {
      _id: { $in: ids },
      user: userId,
      deletedAt: null,
      status: { $ne: "completed" },
    },
    { $set: { status: "completed" } }
  );

const bulkSetPriority = (userId: Id, ids: Id[], priority: TaskPriority) =>
  Task.updateMany(
    { _id: { $in: ids }, user: userId, deletedAt: null },
    { $set: { priority } }
  );

const listTrash = async ({
  userId,
  page,
  limit,
}: {
  userId: Id;
  page: number;
  limit: number;
}): Promise<TaskList> => {
  const filter = { user: userId, deletedAt: { $ne: null } };
  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ deletedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);
  return {
    tasks: tasks as unknown as AggTask[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

const MAX_IMPORT_ROWS = 500;

interface ImportDoc {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
  recurrence?: Recurrence;
  tags?: string[];
}

type RowOutcome =
  { doc: ImportDoc; error?: undefined } | { error: string; doc?: undefined };

const parseCsvText = (text: unknown): string[][] => {
  const src = String(text).replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if ((src[i + 1] ?? "") === '"') {
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
      if (ch === "\r" && (src[i + 1] ?? "") === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || (row[0] ?? "").trim() !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || (row[0] ?? "").trim() !== "") rows.push(row);
  }
  return rows;
};

const CSV_HEADER_ALIASES: Record<string, string> = {
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

const csvRowsToObjects = (rows: string[][]): Record<string, string>[] => {
  const [header, ...dataRows] = rows;
  if (!header) return [];
  const keys = header.map((h) => CSV_HEADER_ALIASES[h.trim().toLowerCase()]);
  return dataRows.map((fields) => {
    const obj: Record<string, string> = {};
    keys.forEach((key, i) => {
      const cell = fields[i];
      if (key && cell !== undefined && String(cell).trim() !== "") {
        obj[key] = cell.trim();
      }
    });
    return obj;
  });
};

const normalizeImportRow = (raw: unknown): RowOutcome => {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return { error: "title is required" };
  if (title.length > 200) return { error: "title exceeds 200 characters" };

  const doc: ImportDoc = { title };

  const description = r.description == null ? "" : String(r.description).trim();
  if (description.length > 2000) {
    return { error: "description exceeds 2000 characters" };
  }
  if (description) doc.description = description;

  if (r.status != null && r.status !== "") {
    if (!includesValue(TASK_STATUSES, r.status))
      return { error: `invalid status "${String(r.status)}"` };
    doc.status = r.status as TaskStatus;
  }

  if (r.priority != null && r.priority !== "") {
    if (!includesValue(TASK_PRIORITIES, r.priority)) {
      return { error: `invalid priority "${String(r.priority)}"` };
    }
    doc.priority = r.priority as TaskPriority;
  }

  if (r.dueDate != null && r.dueDate !== "") {
    const d = new Date(String(r.dueDate));
    if (Number.isNaN(d.getTime())) {
      return { error: `invalid dueDate "${String(r.dueDate)}"` };
    }
    doc.dueDate = d;
  }

  if (r.recurrence != null && r.recurrence !== "") {
    if (!includesValue(RECURRENCES, r.recurrence)) {
      return { error: `invalid recurrence "${String(r.recurrence)}"` };
    }
    doc.recurrence = r.recurrence as Recurrence;
  }

  let tags = r.tags;
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

interface FailedRow {
  row: number;
  error: string;
}

interface ImportResult {
  imported: number;
  failed: FailedRow[];
  replay?: boolean;
}

interface ImportParams {
  userId: Id;
  rows: unknown;
  idempotencyKey?: string | undefined;
}

const importTasks = async ({
  userId,
  rows,
  idempotencyKey,
}: ImportParams): Promise<ImportResult> => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ValidationError("No importable rows provided");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(
      `Import limited to ${MAX_IMPORT_ROWS} rows per request`
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
      if (isDuplicateKeyError(err)) {
        const existing = await Idempotency.findOne({
          user: userId,
          key: idempotencyKey,
        });
        if (existing && existing.body) {
          return { ...(existing.body as ImportResult), replay: true };
        }
        throw new ConflictError("Idempotent request in progress");
      }
      throw err;
    }
  }

  const docs: (ImportDoc & { user: Id })[] = [];
  const failed: FailedRow[] = [];
  rows.forEach((raw, index) => {
    const outcome = normalizeImportRow(raw || {});
    if (outcome.error) failed.push({ row: index, error: outcome.error });
    else if (outcome.doc) docs.push({ ...outcome.doc, user: userId });
  });

  const inserted =
    docs.length > 0
      ? ((await Task.insertMany(docs)) as unknown as AggTask[])
      : [];
  const result: ImportResult = { imported: inserted.length, failed };

  if (record) {
    record.body = result as unknown as Record<string, unknown>;
    await record.save();
  }
  return result;
};

const formatICalDate = (date: Date | string | number): string =>
  new Date(date)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const icalEscape = (value: unknown): string =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const foldICalLine = (line: string): string => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    parts.push(` ${line.slice(i, i + 74)}`);
  }
  return parts.join("\r\n");
};

const buildICalFeed = async (userId: Id): Promise<string> => {
  const tasks = (await Task.find({ user: userId, deletedAt: null })
    .sort({ dueDate: 1, createdAt: -1 })
    .lean()) as unknown as AggTask[];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TaskAPI//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const t of tasks) {
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

export {
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
export type {
  AggTask,
  TaskList,
  TaskStats,
  ImportDoc,
  ImportResult,
  BulkAction,
};
