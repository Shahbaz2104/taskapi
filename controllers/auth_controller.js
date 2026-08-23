const jwt = require("jsonwebtoken");
const User = require("../models/users_models.js");
const authService = require("../services/auth.service.js");
const analytics = require("../services/analytics.service.js");
const { sendMail, wrap } = require("../services/email.service.js");

const sendVerificationEmail = async (user) => {
  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
  await sendMail({
    to: user.email,
    subject: "Verify your email",
    body: wrap(
      "Verify your email",
      `Click <a href="${process.env.CLIENT_BASE_URL || "http://localhost:3000"}/verify-email?token=${token}">here</a> to verify your account. The link expires in 24 hours.`
    ),
  });
  return token;
};

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create an account and get a token pair
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, minLength: 3, maxLength: 30, example: alice }
 *               email: { type: string, format: email, example: alice@example.com }
 *               password: { type: string, minLength: 6, maxLength: 72, example: secret1 }
 *     responses:
 *       201:
 *         description: User created, token pair returned
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthResponse" }
 *       400:
 *         description: Invalid input or username/email already exists
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 *       429:
 *         description: Too many registration attempts
 */
const register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const user = await User.create({ username, email, password });

    const pair = await authService.issueTokenPair(user._id, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Send verification email; in dev without SMTP the link is echoed back
    let verificationUrl;
    if (!process.env.SMTP_HOST) {
      const token = await sendVerificationEmail(user);
      verificationUrl = `${process.env.CLIENT_BASE_URL || "http://localhost:3000"}/verify-email?token=${token}`;
    } else {
      await sendVerificationEmail(user);
    }

    analytics.capture(user._id, "user_registered");

    res.status(201).json({
      message: "User created",
      userId: user._id,
      ...pair,
      ...(verificationUrl ? { verificationUrl } : {}),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ error: "User exists" });
    }
    throw error;
  }
};

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and get a token pair
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: alice }
 *               password: { type: string, example: secret1 }
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthResponse" }
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 *       429:
 *         description: Too many login attempts
 */
const login = async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) {
    analytics.capture(username || "unknown", "login_failed");
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    analytics.capture(user._id, "login_failed");
    return res.status(400).json({ error: "Invalid credentials" });
  }

  analytics.capture(user._id, "user_logged_in");
  res.status(200).json(
    await authService.issueTokenPair(user._id, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })
  );
};

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token for a new token pair
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthResponse" }
 *       401:
 *         description: Invalid, expired, or reused refresh token
 */
const refresh = async (req, res) => {
  const pair = await authService.refreshAccessToken(req.body.refreshToken);
  res.status(200).json(pair);
};

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       204:
 *         description: Token revoked
 */
const logout = async (req, res) => {
  await authService.revokeRefreshToken(req.body.refreshToken);
  res.status(204).send();
};

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify an email address with the emailed token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 */
const verifyEmail = async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.body.token, process.env.JWT_SECRET);
  } catch {
    return res
      .status(400)
      .json({ error: "Invalid or expired verification token" });
  }

  const user = await User.findOneAndUpdate(
    { email: payload.email, emailVerified: false },
    { $set: { emailVerified: true } },
    { returnDocument: "after" }
  );
  if (!user)
    return res
      .status(400)
      .json({ error: "Invalid or expired verification token" });

  analytics.capture(user._id, "email_verified");
  res.status(200).json({ message: "Email verified" });
};

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Always generic to prevent account enumeration
 *       429:
 *         description: Too many requests
 */
const forgotPassword = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    analytics.capture(user._id, "password_reset_requested");
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30m",
    });
    await sendMail({
      to: user.email,
      subject: "Reset your password",
      body: wrap(
        "Reset your password",
        `Click <a href="${process.env.CLIENT_BASE_URL || "http://localhost:3000"}/reset-password?token=${token}">here</a> to set a new password. The link expires in 30 minutes.`
      ),
    });
  }
  res
    .status(200)
    .json({ message: "If an account exists, a reset link was sent" });
};

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Set a new password with the emailed token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 6, maxLength: 72 }
 *     responses:
 *       200:
 *         description: Password reset, all refresh tokens revoked
 *       400:
 *         description: Invalid or expired token
 */
const resetPassword = async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.body.token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const user = await User.findById(payload.userId);
  if (!user)
    return res.status(400).json({ error: "Invalid or expired reset token" });

  user.password = req.body.password;
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  analytics.capture(user._id, "password_reset_completed");
  res.status(200).json({ message: "Password reset" });
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
