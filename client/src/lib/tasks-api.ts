import { api } from "@/lib/api";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type Recurrence = "daily" | "weekly" | "monthly";

export interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
  recurrence?: Recurrence | null;
  createdAt: string;
  updatedAt: string;
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
