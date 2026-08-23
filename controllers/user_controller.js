const User = require("../models/users_models.js");
const Task = require("../models/tasks_models.js");
const Token = require("../models/token_models.js");
const authService = require("../services/auth.service.js");
const analytics = require("../services/analytics.service.js");
const QRCode = require("qrcode");

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

/**
 * @swagger
 * /me/2fa/setup:
 *   post:
 *     summary: Begin 2FA enrollment — returns an otpauth URI and QR code
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Pending TOTP secret (not active until /me/2fa/enable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 otpauthUri: { type: string, example: "otpauth://totp/TaskAPI:alice?secret=..." }
 *                 qrDataUrl: { type: string, description: PNG data URL of the QR code }
 *       400:
 *         description: 2FA is already enabled
 *       401:
 *         description: Missing or invalid token
 */
const setup2fa = async (req, res) => {
  const user = await User.findById(req.user.userId).select("+totpSecret");
  if (user.totpEnabled) {
    return res
      .status(400)
      .json({ error: "2FA is already enabled — disable it first" });
  }

  const { secret, otpauthUri } = authService.buildTotpSetup(user.username);
  user.totpSecret = secret;
  await user.save();

  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  res.status(200).json({ otpauthUri, qrDataUrl });
};

/**
 * @swagger
 * /me/2fa/enable:
 *   post:
 *     summary: Confirm 2FA with a code from the authenticator app
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: Current 6-digit TOTP code, example "123456" }
 *     responses:
 *       200:
 *         description: 2FA enabled — recovery codes returned once and never again
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 recoveryCodes: { type: array, items: { type: string } }
 *       400:
 *         description: No pending setup or invalid code
 *       401:
 *         description: Missing or invalid token
 */
const enable2fa = async (req, res) => {
  const user = await User.findById(req.user.userId).select(
    "+totpSecret +recoveryCodes"
  );
  if (!user.totpSecret) {
    return res.status(400).json({ error: "Start 2FA setup first" });
  }

  if (!authService.isTotpValid(user.totpSecret, req.body.token)) {
    return res.status(400).json({ error: "Invalid verification code" });
  }

  const plaintextCodes = authService.newRecoveryCodes();
  user.recoveryCodes = plaintextCodes.map((c) => ({
    codeHash: authService.hashToken(c),
    usedAt: null,
  }));
  user.totpEnabled = true;
  await user.save();

  analytics.capture(user._id, "2fa_enabled");
  res.status(200).json({
    message: "2FA enabled — store your recovery codes safely",
    recoveryCodes: plaintextCodes,
  });
};

/**
 * @swagger
 * /me/2fa/disable:
 *   post:
 *     summary: Turn off 2FA (password + current code or recovery code required)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *               code: { type: string, description: 6-digit TOTP code }
 *               recoveryCode: { type: string, description: Single-use recovery code }
 *     responses:
 *       200:
 *         description: 2FA disabled and all sessions revoked
 *       400:
 *         description: Wrong password, missing/wrong code, or 2FA not enabled
 *       401:
 *         description: Missing or invalid token
 */
const disable2fa = async (req, res) => {
  const { password, code, recoveryCode } = req.body;

  const user = await User.findById(req.user.userId).select(
    "+totpSecret +recoveryCodes"
  );
  if (!user.totpEnabled) {
    return res.status(400).json({ error: "2FA is not enabled" });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(400).json({ error: "Password is incorrect" });
  }

  const codeOk =
    (code && authService.isTotpValid(user.totpSecret, code)) ||
    (!!recoveryCode &&
      !!authService.matchUnusedRecoveryCode(user, recoveryCode));
  if (!codeOk) {
    return res.status(400).json({
      error: "Provide your authenticator code or a valid recovery code",
    });
  }

  user.totpSecret = null;
  user.totpEnabled = false;
  user.recoveryCodes = [];
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  analytics.capture(user._id, "2fa_disabled");
  res.status(200).json({ message: "2FA disabled — please log in again" });
};

// --- iCal calendar feed management ---

const buildFeedUrl = (req, token) => {
  const base =
    process.env.CLIENT_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/v1/tasks/calendar.ics?token=${token}`;
};

/**
 * @swagger
 * /me/calendar-feed:
 *   get:
 *     summary: Get your iCal feed URL (token is provisioned on first view)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Feed token and ready-to-subscribe URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 url: { type: string, example: "https://api.example.com/api/v1/tasks/calendar.ics?token=..." }
 */
const getCalendarFeedSettings = async (req, res) => {
  const feedToken = await authService.getOrCreateFeedToken(req.user.userId);
  res.status(200).json({ token: feedToken, url: buildFeedUrl(req, feedToken) });
};

/**
 * @swagger
 * /me/calendar-feed/rotate:
 *   post:
 *     summary: Regenerate your iCal feed token (old URL stops working)
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: New feed token and URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 url: { type: string }
 */
const rotateCalendarFeedToken = async (req, res) => {
  const feedToken = await authService.rotateFeedToken(req.user.userId);
  res.status(200).json({ token: feedToken, url: buildFeedUrl(req, feedToken) });
};

module.exports = {
  getMe,
  updateMe,
  changePassword,
  deleteMe,
  listSessions,
  revokeSession,
  setup2fa,
  enable2fa,
  disable2fa,
  getCalendarFeedSettings,
  rotateCalendarFeedToken,
};
