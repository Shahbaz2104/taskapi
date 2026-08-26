import type { RequestHandler } from "express";
import { User } from "../models/user.js";
import { TaskShare } from "../models/taskShare.js";
import { Comment } from "../models/comment.js";
import { Activity } from "../models/activity.js";
import {
  loadTaskWithAccess,
  recordActivity,
  listSharedTasks,
} from "../services/collab.service.js";
import { capture } from "../services/analytics.service.js";
import { currentUser } from "../middleware/auth.js";

const isDuplicateKey = (err: unknown): boolean =>
  err instanceof Error && (err as { code?: unknown }).code === 11000;

interface ShareBody {
  username: string;
  role: "viewer" | "editor";
}

const createShare: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const access = await loadTaskWithAccess({
    taskId: req.params.id as string,
    userId: auth.userId,
    minRole: "owner",
  });
  if (!access) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const { username, role } = req.body as ShareBody;
  const grantee = await User.findOne({ username }).select("_id username");
  if (!grantee) {
    res.status(400).json({ error: "User not found" });
    return;
  }
  if (String(grantee._id) === String(access.task.user)) {
    res.status(400).json({ error: "Cannot share a task with its owner" });
    return;
  }

  try {
    const share = await TaskShare.create({
      task: access.task._id,
      user: grantee._id,
      role,
      grantedBy: auth.userId,
    });
    await recordActivity({
      taskId: access.task._id,
      userId: auth.userId,
      action: "share.granted",
      meta: { username: grantee.username, role: share.role },
    });
    capture(auth.userId, "task_shared", { role: share.role });
    res.status(201).json(share);
  } catch (err) {
    if (isDuplicateKey(err)) {
      res.status(409).json({ error: "User already has access to this task" });
      return;
    }
    throw err;
  }
};

const listShares: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const access = await loadTaskWithAccess({
    taskId: req.params.id as string,
    userId: auth.userId,
    minRole: "owner",
  });
  if (!access) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const shares = (await TaskShare.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .lean()) as unknown as Array<{
    _id: unknown;
    user: unknown;
    role: string;
    grantedBy: unknown;
    createdAt: Date;
  }>;
  res.status(200).json({
    shares: shares.map((s) => ({
      _id: s._id,
      user: s.user,
      role: s.role,
      grantedBy: s.grantedBy,
      createdAt: s.createdAt,
    })),
  });
};

const revokeShare: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const access = await loadTaskWithAccess({
    taskId: req.params.id as string,
    userId: auth.userId,
    minRole: "owner",
  });
  if (!access) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const deleted = await TaskShare.findOneAndDelete({
    _id: req.params.shareId,
    task: access.task._id,
  });
  if (!deleted) {
    res.status(404).json({ error: "Share not found" });
    return;
  }

  await recordActivity({
    taskId: access.task._id,
    userId: auth.userId,
    action: "share.revoked",
  });
  capture(auth.userId, "share_revoked");
  res.status(204).send();
};

const listComments: RequestHandler = async (req, res) => {
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

  const comments = await Comment.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ comments });
};

const addComment: RequestHandler = async (req, res) => {
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
  if (access.role === "viewer") {
    res.status(403).json({ error: "Editor access required to comment" });
    return;
  }

  const comment = await Comment.create({
    task: access.task._id,
    user: auth.userId,
    body: (req.body as { body: string }).body,
  });
  await recordActivity({
    taskId: access.task._id,
    userId: auth.userId,
    action: "comment.created",
    meta: { commentId: String(comment._id) },
  });
  capture(auth.userId, "comment_created");
  res.status(201).json(comment);
};

const getActivity: RequestHandler = async (req, res) => {
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

  const activity = await Activity.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.status(200).json({ activity });
};

const listSharedForMe: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const shared = await listSharedTasks(auth.userId);
  res.status(200).json({ shared });
};

export {
  createShare,
  listShares,
  revokeShare,
  listComments,
  addComment,
  getActivity,
  listSharedForMe,
};
