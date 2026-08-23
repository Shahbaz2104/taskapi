import { api } from "@/lib/api";

export type CollaboratorRole = "viewer" | "editor";

export interface Share {
  _id: string;
  user: { _id?: string; username: string };
  role: CollaboratorRole;
  createdAt: string;
}

export interface CollabComment {
  _id: string;
  body: string;
  user: { _id?: string; username: string } | string;
  createdAt: string;
}

export interface ActivityEntry {
  _id: string;
  action: string;
  meta?: Record<string, unknown> | null;
  user?: { _id?: string; username: string } | null;
  createdAt: string;
}

export interface SharedWithMe {
  _id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt: string;
  ownerId: string;
  myRole: CollaboratorRole;
  sharedAt: string;
}

export function getTask(id: string) {
  return api<import("@/lib/tasks-api").Task>(`/tasks/${id}`);
}

export function listShares(taskId: string) {
  return api<{ shares: Share[] }>(`/tasks/${taskId}/shares`);
}

export function createShare(
  taskId: string,
  username: string,
  role: CollaboratorRole
) {
  return api<Share>(`/tasks/${taskId}/shares`, {
    method: "POST",
    body: { username, role },
  });
}

export function revokeShare(taskId: string, shareId: string) {
  return api<void>(`/tasks/${taskId}/shares/${shareId}`, { method: "DELETE" });
}

export function listComments(taskId: string) {
  return api<{ comments: CollabComment[] }>(`/tasks/${taskId}/comments`);
}

export function addComment(taskId: string, body: string) {
  return api<CollabComment>(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: { body },
  });
}

export function getActivity(taskId: string) {
  return api<{ activity: ActivityEntry[] }>(`/tasks/${taskId}/activity`);
}

export function listSharedWithMe() {
  return api<{ shared: SharedWithMe[] }>(`/me/shared`);
}
