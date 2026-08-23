// Collaboration access layer. loadTaskWithAccess is the single
// chokepoint every shared-task route resolves permissions through:
// owner > editor > viewer, and any failure collapses to null so
// controllers can answer 404 without leaking task existence.

const Task = require("../models/tasks_models.js");
const TaskShare = require("../models/task_share_models.js");
const Activity = require("../models/activity_models.js");

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

const loadTaskWithAccess = async ({ taskId, userId, minRole }) => {
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

const recordActivity = async ({ taskId, userId, action, meta }) =>
  Activity.create({ task: taskId, user: userId, action, meta: meta ?? null });

// Tasks other users have shared with this account, most recent first
const listSharedTasks = async (userId) => {
  const shares = await TaskShare.find({ user: userId })
    .populate({
      path: "task",
      match: { deletedAt: null },
      select: "title status priority dueDate user createdAt updatedAt",
    })
    .sort({ createdAt: -1 })
    .lean();

  return shares
    .filter((s) => s.task)
    .map((s) => ({
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
    }));
};

module.exports = {
  ROLE_RANK,
  loadTaskWithAccess,
  recordActivity,
  listSharedTasks,
};
