import { api, apiText } from "@/lib/api";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type Recurrence = "daily" | "weekly" | "monthly";

export interface Task {
  _id: string;
  /** Owner id — lets the detail page decide who manages access. */
  user?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
  recurrence?: Recurrence | null;
  createdAt: string;
  updatedAt: string;
  /** Present only for trashed tasks. */
  deletedAt?: string;
}

export interface TasksPage {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaskFilters {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  search?: string;
  sort?: string;
}

const SORTS = [
  "-createdAt",
  "createdAt",
  "-updatedAt",
  "dueDate",
  "-dueDate",
  "-priority",
];

function buildParams(filters: TaskFilters) {
  const params = new URLSearchParams();
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.status) params.set("status", filters.status);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.sort && SORTS.includes(filters.sort))
    params.set("sort", filters.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function listTasks(filters: TaskFilters) {
  return api<TasksPage>(`/tasks${buildParams(filters)}`);
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  tags?: string[];
  recurrence?: Recurrence | null;
}

export function createTask(input: TaskInput) {
  return api<Task>("/tasks", { method: "POST", body: input });
}

export function updateTask(id: string, patch: Partial<TaskInput>) {
  return api<Task>(`/tasks/${id}`, { method: "PUT", body: patch });
}

/** Soft-deletes into the trash (restorable until retention purge). */
export function deleteTask(id: string) {
  return api<{ message?: string }>(`/tasks/${id}`, { method: "DELETE" });
}

/* ── Trash ────────────────────────────────────────────────── */

export function listTrash(filters: TaskFilters) {
  return api<TasksPage>(`/tasks/trash${buildParams(filters)}`);
}

export type BulkAction = "complete" | "trash" | "restore" | "purge";

export function bulkAction(ids: string[], action: BulkAction) {
  return api<{ modified: number; matched: number }>(`/tasks/bulk`, {
    method: "PATCH",
    body: { ids, action },
  });
}

export function emptyTrash() {
  return api<{ deleted: number }>(`/tasks/trash`, { method: "DELETE" });
}

/* ── Stats & export ───────────────────────────────────────── */

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: number;
}

export function getStats() {
  return api<TaskStats>(`/tasks/stats`);
}

/** Server-rendered CSV of all live tasks (respects optional status). */
export function exportTasksCsv(status?: TaskStatus): Promise<string> {
  const qs = status ? `?status=${status}` : "";
  return apiText(`/tasks/export${qs}`);
}
