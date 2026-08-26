import type { RequestHandler } from "express";
import QRCode from "qrcode";
import { env } from "../config/env.js";
import { Task } from "../models/task.js";
import { Token } from "../models/token.js";
import { User } from "../models/user.js";
import { currentUser } from "../middleware/auth.js";
import * as authService from "../services/auth.service.js";
import { capture } from "../services/analytics.service.js";
import { toPublicUser } from "../dto/user.dto.js";

const getMe: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const user = await User.findById(userId).select("-password");
  res.status(200).json(user ? toPublicUser(user) : user);
};

const updateMe: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const body = req.body as { username?: string; email?: string };
  const updates: Record<string, unknown> = {};
  if (body.username !== undefined) updates.username = body.username;
  if (body.email !== undefined) {
    updates.email = body.email;
    updates.emailVerified = false;
  }

  try {
    const user = await User.findByIdAndUpdate(userId, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");
    res.status(200).json(user ? toPublicUser(user) : user);
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { code?: unknown }).code === 11000
    ) {
      res.status(400).json({ error: "Username or email already taken" });
      return;
    }
    throw error;
  }
};

const changePassword: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  const user = await User.findById(userId);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  const isMatch = await user.comparePassword(currentPassword ?? "");
  if (!isMatch) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  user.password = newPassword ?? "";
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  res.status(200).json({ message: "Password changed" });
};

const deleteMe: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  await Promise.all([
    User.deleteOne({ _id: userId }),
    Task.deleteMany({ user: userId }),
    Token.deleteMany({ user: userId }),
  ]);
  res.status(204).send();
};

const listSessions: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const sessions = await authService.listUserSessions(userId);
  res.status(200).json({ sessions });
};

const revokeSession: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  await authService.revokeSessionById(userId, req.params.sessionId as string);
  res.status(204).send();
};

const setup2fa: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const user = await User.findById(userId).select("+totpSecret");
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  if (user.totpEnabled) {
    res
      .status(400)
      .json({ error: "2FA is already enabled — disable it first" });
    return;
  }

  const { secret, otpauthUri } = authService.buildTotpSetup(user.username);
  user.totpSecret = secret;
  await user.save();

  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  res.status(200).json({ otpauthUri, qrDataUrl });
};

const enable2fa: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const token = (req.body as { token?: string }).token;

  const user = await User.findById(userId).select("+totpSecret +recoveryCodes");
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  if (!user.totpSecret) {
    res.status(400).json({ error: "Start 2FA setup first" });
    return;
  }

  if (!user.totpSecret || !authService.isTotpValid(user.totpSecret, token)) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }

  const plaintextCodes = authService.newRecoveryCodes();
  user.set(
    "recoveryCodes",
    plaintextCodes.map((c) => ({
      codeHash: authService.hashToken(c),
      usedAt: null,
    }))
  );
  user.totpEnabled = true;
  await user.save();

  capture(user._id, "2fa_enabled");
  res.status(200).json({
    message: "2FA enabled — store your recovery codes safely",
    recoveryCodes: plaintextCodes,
  });
};

const disable2fa: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const { password, code, recoveryCode } = req.body as {
    password?: string;
    code?: string;
    recoveryCode?: string;
  };

  const user = await User.findById(userId).select("+totpSecret +recoveryCodes");
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  if (!user.totpEnabled) {
    res.status(400).json({ error: "2FA is not enabled" });
    return;
  }

  const isMatch = await user.comparePassword(password ?? "");
  if (!isMatch) {
    res.status(400).json({ error: "Password is incorrect" });
    return;
  }

  const codeOk =
    (code &&
      !!user.totpSecret &&
      authService.isTotpValid(user.totpSecret, code)) ||
    (!!recoveryCode &&
      !!authService.matchUnusedRecoveryCode(user, recoveryCode));
  if (!codeOk) {
    res.status(400).json({
      error: "Provide your authenticator code or a valid recovery code",
    });
    return;
  }

  user.totpSecret = null;
  user.totpEnabled = false;
  user.set("recoveryCodes", []);
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  capture(user._id, "2fa_disabled");
  res.status(200).json({ message: "2FA disabled — please log in again" });
};

const buildFeedUrl = (
  req: { protocol: string; get: (h: string) => string | undefined },
  token: string
): string => {
  const base = env.CLIENT_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/v1/tasks/calendar.ics?token=${token}`;
};

const getCalendarFeedSettings: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const feedToken = await authService.getOrCreateFeedToken(userId);
  res.status(200).json({
    token: feedToken,
    url: buildFeedUrl(req as never, feedToken),
  });
};

const rotateCalendarFeedToken: RequestHandler = async (req, res) => {
  const { userId } = currentUser(req);
  const feedToken = await authService.rotateFeedToken(userId);
  res.status(200).json({
    token: feedToken,
    url: buildFeedUrl(req as never, feedToken),
  });
};

export {
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
