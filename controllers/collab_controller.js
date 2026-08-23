const { z } = require("zod");
const User = require("../models/users_models.js");
const TaskShare = require("../models/task_share_models.js");
const Comment = require("../models/comment_models.js");
const collab = require("../services/collab.service.js");
const analytics = require("../services/analytics.service.js");

// zod schemas (new-endpoint convention)
const createShareSchema = z.object({
  username: z.string().min(3).max(30),
  role: z.enum(["viewer", "editor"]),
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

// --- Sharing management (owner-only; non-owners see 404) ---

/**
 * @swagger
 * /tasks/{id}/shares:
 *   post:
 *     summary: Share a task with another user by username (owner only)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, role]
 *             properties:
 *               username: { type: string }
 *               role: { type: string, enum: [viewer, editor] }
 *     responses:
 *       201:
 *         description: Share created
 *       400:
 *         description: Invalid payload or unknown username
 *       404:
 *         description: Task not found or caller is not the owner
 */
const createShare = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "owner",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });

  const grantee = await User.findOne({ username: req.body.username }).select(
    "_id username"
  );
  if (!grantee) return res.status(400).json({ error: "User not found" });
  if (String(grantee._id) === String(access.task.user)) {
    return res
      .status(400)
      .json({ error: "Cannot share a task with its owner" });
  }

  try {
    const share = await TaskShare.create({
      task: access.task._id,
      user: grantee._id,
      role: req.body.role,
      grantedBy: req.user.userId,
    });
    await collab.recordActivity({
      taskId: access.task._id,
      userId: req.user.userId,
      action: "share.granted",
      meta: { username: grantee.username, role: share.role },
    });
    analytics.capture(req.user.userId, "task_shared", { role: share.role });
    res.status(201).json(share);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: "User already has access to this task" });
    }
    throw err;
  }
};

/**
 * @swagger
 * /tasks/{id}/shares:
 *   get:
 *     summary: List collaborators on a task (owner only)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Shares with usernames
 *       404:
 *         description: Task not found or caller is not the owner
 */
const listShares = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "owner",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });

  const shares = await TaskShare.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .lean();
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

/**
 * @swagger
 * /tasks/{id}/shares/{shareId}:
 *   delete:
 *     summary: Revoke a collaborator's access (owner only)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *       - { name: shareId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       204:
 *         description: Revoked
 *       404:
 *         description: Task or share not found / caller is not the owner
 */
const revokeShare = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "owner",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });

  const deleted = await TaskShare.findOneAndDelete({
    _id: req.params.shareId,
    task: access.task._id,
  });
  if (!deleted) return res.status(404).json({ error: "Share not found" });

  await collab.recordActivity({
    taskId: access.task._id,
    userId: req.user.userId,
    action: "share.revoked",
  });
  analytics.capture(req.user.userId, "share_revoked");
  res.status(204).send();
};

// --- Comments (members read; editors+ write) ---

/**
 * @swagger
 * /tasks/{id}/comments:
 *   get:
 *     summary: List comments on a task (any member)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Comments, newest first
 *       404:
 *         description: Task not found or no access
 */
const listComments = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "viewer",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });

  const comments = await Comment.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json({ comments });
};

/**
 * @swagger
 * /tasks/{id}/comments:
 *   post:
 *     summary: Add a comment (editor or owner)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Comment created
 *       403:
 *         description: Viewer role — editor access required to comment
 *       404:
 *         description: Task not found or no access
 */
const addComment = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "viewer",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });
  if (access.role === "viewer") {
    return res.status(403).json({ error: "Editor access required to comment" });
  }

  const comment = await Comment.create({
    task: access.task._id,
    user: req.user.userId,
    body: req.body.body,
  });
  await collab.recordActivity({
    taskId: access.task._id,
    userId: req.user.userId,
    action: "comment.created",
    meta: { commentId: String(comment._id) },
  });
  analytics.capture(req.user.userId, "comment_created");
  res.status(201).json(comment);
};

// --- Activity log (members read; append-only) ---

/**
 * @swagger
 * /tasks/{id}/activity:
 *   get:
 *     summary: Activity trail for a task (any member)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Activity entries, newest first
 *       404:
 *         description: Task not found or no access
 */
const getActivity = async (req, res) => {
  const access = await collab.loadTaskWithAccess({
    taskId: req.params.id,
    userId: req.user.userId,
    minRole: "viewer",
  });
  if (!access) return res.status(404).json({ error: "Task not found" });

  const Activity = require("../models/activity_models.js");
  const activity = await Activity.find({ task: access.task._id })
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.status(200).json({ activity });
};

/**
 * @swagger
 * /me/shared:
 *   get:
 *     summary: Tasks other users have shared with you
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Shared tasks including your role on each
 */
const listSharedForMe = async (req, res) => {
  const shared = await collab.listSharedTasks(req.user.userId);
  res.status(200).json({ shared });
};

module.exports = {
  createShareSchema,
  createCommentSchema,
  createShare,
  listShares,
  revokeShare,
  listComments,
  addComment,
  getActivity,
  listSharedForMe,
};
