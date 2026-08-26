import type { Types } from "mongoose";
import { Activity } from "../models/activity.js";
import { Task, type TaskDocument } from "../models/task.js";
import { TaskShare, type ShareRole } from "../models/taskShare.js";

type CollabRole = ShareRole | "owner";

const ROLE_RANK: Record<CollabRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

interface AccessContext {
  taskId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  minRole: CollabRole;
}

type AccessResult =
  | { task: TaskDocument; role: "owner" }
  | { task: TaskDocument; role: ShareRole }
  | null;

const loadTaskWithAccess = async ({
  taskId,
  userId,
  minRole,
}: AccessContext): Promise<AccessResult> => {
  const task = await Task.findOne({ _id: taskId, deletedAt: null });
  if (!task) return null;

  if (String(task.user) === String(userId)) {
    return { task, role: "owner" };
  }

  const share = await TaskShare.findOne({ task: taskId, user: userId });
  const role = share ? share.role : null;
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) return null;

  return { task, role };
};

const recordActivity = async ({
  taskId,
  userId,
  action,
  meta,
}: {
  taskId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  action: string;
  meta?: Record<string, unknown>;
}): Promise<unknown> =>
  Activity.create({
    task: taskId,
    user: userId,
    action,
    meta: meta ?? null,
  });

interface SharedTaskRow {
  _id: Types.ObjectId;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: Types.ObjectId;
  myRole: ShareRole;
  sharedAt: Date;
}

interface LeanPopulatedTask {
  _id: Types.ObjectId;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface LeanShareRow {
  _id: Types.ObjectId;
  task: LeanPopulatedTask | null;
  role: ShareRole;
  createdAt: Date;
  updatedAt: Date;
}

const listSharedTasks = async (
  userId: string | Types.ObjectId
): Promise<SharedTaskRow[]> => {
  const shares = (await TaskShare.find({ user: userId })
    .populate({
      path: "task",
      match: { deletedAt: null },
      select: "title status priority dueDate user createdAt updatedAt",
    })
    .sort({ createdAt: -1 })
    .lean()) as unknown as LeanShareRow[];

  return shares.flatMap((s) =>
    s.task
      ? [
          {
            _id: s.task._id,
            title: s.task.title,
            status: s.task.status,
            priority: s.task.priority,
            dueDate: s.task.dueDate,
            createdAt: s.task.createdAt,
            updatedAt: s.task.updatedAt,
            ownerId: s.task.user,
            myRole: s.role,
            sharedAt: s.createdAt,
          },
        ]
      : []
  );
};

export { ROLE_RANK, loadTaskWithAccess, recordActivity, listSharedTasks };
export type { CollabRole, AccessResult, SharedTaskRow };
