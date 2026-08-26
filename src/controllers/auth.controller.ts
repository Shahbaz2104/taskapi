import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/user.js";
import * as authService from "../services/auth.service.js";
import { capture } from "../services/analytics.service.js";
import { sendMail, wrap } from "../services/email.service.js";
import { AuthenticationError } from "../errors/index.js";
import type { UserDocument } from "../models/user.js";

const uaHeader = (req: Request): string | null => {
  const h = req.headers["user-agent"];
  if (Array.isArray(h)) return h[0] ?? null;
  return h ?? null;
};

const compact = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
};

const sendVerificationEmail = async (user: UserDocument): Promise<string> => {
  const token = jwt.sign({ email: user.email }, env.JWT_SECRET, {
    expiresIn: "24h",
  });
  await sendMail({
    to: user.email,
    subject: "Verify your email",
    body: wrap(
      "Verify your email",
      `Click <a href="${env.CLIENT_BASE_URL}/verify-email?token=${token}">here</a> to verify your account. The link expires in 24 hours.`
    ),
  });
  return token;
};

interface RegisterBody {
  username: string;
  email: string;
  password: string;
}

const register: RequestHandler = async (req, res) => {
  const { username, email, password } = req.body as RegisterBody;

  try {
    const user = (await User.create(
      compact({ username, email, password })
    )) as unknown as UserDocument;

    const pair = await authService.issueTokenPair(user._id, {
      ip: req.ip ?? null,
      userAgent: uaHeader(req),
    });

    let verificationUrl: string | undefined;
    if (!env.SMTP_HOST) {
      const token = await sendVerificationEmail(user);
      verificationUrl = `${env.CLIENT_BASE_URL}/verify-email?token=${token}`;
    } else {
      await sendVerificationEmail(user);
    }

    capture(user._id, "user_registered");

    res.status(201).json({
      message: "User created",
      userId: user._id,
      ...pair,
      ...(verificationUrl ? { verificationUrl } : {}),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { code?: unknown }).code === 11000
    ) {
      res.status(400).json({ error: "User exists" });
      return;
    }
    throw error;
  }
};

const login: RequestHandler = async (req, res) => {
  const { username, password } = req.body as {
    username: string;
    password: string;
  };

  const user = await User.findOne({ username });
  if (!user) {
    capture(username || "unknown", "login_failed");
    res.status(400).json({ error: "Invalid credentials" });
    return;
  }

  const isMatch = await user.comparePassword(password ?? "");
  if (!isMatch) {
    capture(user._id, "login_failed");
    res.status(400).json({ error: "Invalid credentials" });
    return;
  }

  if (user.totpEnabled) {
    res.status(200).json({
      requires2FA: true,
      challengeToken: authService.createChallengeToken(user._id),
      message: "Enter your authenticator code",
    });
    return;
  }

  capture(user._id, "user_logged_in");
  res.status(200).json(
    await authService.issueTokenPair(user._id, {
      ip: req.ip ?? null,
      userAgent: uaHeader(req),
    })
  );
};

const verify2faChallenge: RequestHandler = async (req, res) => {
  const { challengeToken, code, recoveryCode } = req.body as {
    challengeToken?: string;
    code?: string;
    recoveryCode?: string;
  };
  const userId = authService.verifyChallengeToken(challengeToken ?? "");

  const user = await User.findById(userId).select("+totpSecret +recoveryCodes");
  if (!user || !user.totpEnabled) {
    throw new AuthenticationError("Invalid or expired challenge token");
  }

  let usedRecovery = false;
  if (code && authService.isTotpValid(user.totpSecret ?? "", code)) {
    // valid authenticator code
  } else if (
    recoveryCode &&
    authService.matchUnusedRecoveryCode(user, recoveryCode)
  ) {
    usedRecovery = true;
  } else {
    capture(user._id, "login_failed");
    res.status(401).json({ error: "Invalid authentication code" });
    return;
  }

  if (usedRecovery) await user.save();

  capture(user._id, "user_logged_in", { via2FA: true });
  res.status(200).json(
    await authService.issueTokenPair(user._id, {
      ip: req.ip ?? null,
      userAgent: uaHeader(req),
    })
  );
};

const refresh: RequestHandler = async (req, res) => {
  const pair = await authService.refreshAccessToken(
    (req.body as { refreshToken?: string }).refreshToken ?? ""
  );
  res.status(200).json(pair);
};

const logout: RequestHandler = async (req, res) => {
  await authService.revokeRefreshToken(
    (req.body as { refreshToken?: string }).refreshToken ?? ""
  );
  res.status(204).send();
};

const verifyEmail: RequestHandler = async (req, res) => {
  let payload: jwt.JwtPayload | string;
  try {
    payload = jwt.verify(
      (req.body as { token?: string }).token ?? "",
      env.JWT_SECRET
    );
  } catch {
    res.status(400).json({ error: "Invalid or expired verification token" });
    return;
  }

  const email =
    typeof payload === "object" && payload !== null
      ? (payload as { email?: string }).email
      : undefined;

  const user = (await User.findOneAndUpdate(
    { email, emailVerified: false } as never,
    { $set: { emailVerified: true } },
    { returnDocument: "after" }
  )) as unknown as UserDocument | null;
  if (!user) {
    res.status(400).json({ error: "Invalid or expired verification token" });
    return;
  }

  capture(user._id, "email_verified");
  res.status(200).json({ message: "Email verified" });
};

const forgotPassword: RequestHandler = async (req, res) => {
  const user = await User.findOne({
    email: (req.body as { email?: string }).email,
  } as never);
  if (user) {
    capture(user._id, "password_reset_requested");
    const token = jwt.sign({ userId: String(user._id) }, env.JWT_SECRET, {
      expiresIn: "30m",
    });
    await sendMail({
      to: user.email,
      subject: "Reset your password",
      body: wrap(
        "Reset your password",
        `Click <a href="${env.CLIENT_BASE_URL}/reset-password?token=${token}">here</a> to set a new password. The link expires in 30 minutes.`
      ),
    });
  }
  res
    .status(200)
    .json({ message: "If an account exists, a reset link was sent" });
};

const resetPassword: RequestHandler = async (req, res) => {
  let payload: jwt.JwtPayload | string;
  try {
    payload = jwt.verify(
      (req.body as { token?: string }).token ?? "",
      env.JWT_SECRET
    );
  } catch {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  const userId =
    typeof payload === "object" && payload !== null
      ? (payload as { userId?: string }).userId
      : undefined;

  const user = userId ? await User.findById(userId) : null;
  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  user.password = (req.body as { password?: string }).password ?? "";
  await user.save();
  await authService.revokeAllUserTokens(user._id);

  capture(user._id, "password_reset_completed");
  res.status(200).json({ message: "Password reset" });
};

export {
  register,
  login,
  verify2faChallenge,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
