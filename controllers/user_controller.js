const User = require("../models/users_models.js");
const Task = require("../models/tasks_models.js");
const Token = require("../models/token_models.js");
const authService = require("../services/auth.service.js");

/**
 * @swagger
 * /me:
 *   get:
 *     summary: Get your profile
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/User" }
 *       401:
 *         description: Missing or invalid token
 */
const getMe = async (req, res) => {
  const user = await User.findById(req.user.userId).select("-password");
  res.status(200).json(user);
};

/**
 * @swagger
 * /me:
 *   patch:
 *     summary: Update your username or email
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string, minLength: 3, maxLength: 30 }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Invalid input or taken username/email
 *       401:
 *         description: Missing or invalid token
 */
const updateMe = async (req, res) => {
  const updates = {};
  if (req.body.username !== undefined) updates.username = req.body.username;
  if (req.body.email !== undefined) {
    updates.email = req.body.email;
    updates.emailVerified = false;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "At least one field is required" });
  }

  try {
    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");
    res.status(200).json(user);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ error: "Username or email already taken" });
    }
    throw error;
  }
};

/**
 * @swagger
 * /me/password:
 *   put:
 *     summary: Change your password (revokes all refresh tokens)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 6, maxLength: 72 }
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Wrong current password
 *       401:
 *         description: Missing or invalid token
 */
const changePassword = async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(401).json({ error: "User no longer exists" });

  const isMatch = await user.comparePassword(req.body.currentPassword);
  if (!isMatch)
    return res.status(400).json({ error: "Current password is incorrect" });

  user.password = req.body.newPassword;
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  res.status(200).json({ message: "Password changed" });
};

/**
 * @swagger
 * /me:
 *   delete:
 *     summary: Delete your account and all your data
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204:
 *         description: Account deleted
 *       401:
 *         description: Missing or invalid token
 */
const deleteMe = async (req, res) => {
  await Promise.all([
    User.deleteOne({ _id: req.user.userId }),
    Task.deleteMany({ user: req.user.userId }),
    Token.deleteMany({ user: req.user.userId }),
  ]);
  res.status(204).send();
};

/**
 * @swagger
 * /me/sessions:
 *   get:
 *     summary: List your active sessions (devices with a live refresh token)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Active sessions, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       ip: { type: string, nullable: true }
 *                       userAgent: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       expiresAt: { type: string, format: date-time }
 *       401:
 *         description: Missing or invalid token
 */
const listSessions = async (req, res) => {
  const sessions = await authService.listUserSessions(req.user.userId);
  res.status(200).json({ sessions });
};

/**
 * @swagger
 * /me/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke one of your sessions (log out that device)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: sessionId, in: path, required: true, schema: { type: string }, description: Session ID (from the token pair response or the sessions list) }
 *     responses:
 *       204:
 *         description: Session revoked
 *       400:
 *         description: Invalid session ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Session not found (already revoked, expired, or not yours)
 */
const revokeSession = async (req, res) => {
  await authService.revokeSessionById(req.user.userId, req.params.sessionId);
  res.status(204).send();
};

module.exports = {
  getMe,
  updateMe,
  changePassword,
  deleteMe,
  listSessions,
  revokeSession,
};
