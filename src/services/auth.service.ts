import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { authenticator } from "otplib";
import type { Types } from "mongoose";
import { env } from "../config/env.js";
import { Token } from "../models/token.js";
import { User, type UserAttrs, type UserDocument } from "../models/user.js";
import { AuthenticationError, NotFoundError } from "../errors/index.js";
import type { ChallengeTokenPayload } from "../types/auth.js";

const CHALLENGE_TTL = "5m";
const RECOVERY_CODE_COUNT = 8;
const MAX_USER_AGENT_LENGTH = 256;

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const newFeedToken = (): string => crypto.randomBytes(32).toString("hex");

const getOrCreateFeedToken = async (
  userId: string | Types.ObjectId
): Promise<string> => {
  const user = await User.findById(userId).select("calendarFeedToken");
  if (!user) throw new NotFoundError("User not found");
  if (user.calendarFeedToken) return user.calendarFeedToken;
  user.calendarFeedToken = newFeedToken();
  await user.save();
  return user.calendarFeedToken;
};

const rotateFeedToken = async (
  userId: string | Types.ObjectId
): Promise<string> => {
  const token = newFeedToken();
  await User.updateOne({ _id: userId }, { $set: { calendarFeedToken: token } });
  return token;
};

const findUserByFeedToken = (token: string) =>
  User.findOne({ calendarFeedToken: token }).select("_id username email");

const signAccessToken = (userId: string | Types.ObjectId): string =>
  jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  });

interface SessionMeta {
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

const issueRefreshToken = async (
  userId: string | Types.ObjectId,
  meta: SessionMeta = {}
): Promise<{ token: string; sessionId: Types.ObjectId }> => {
  const token = crypto.randomBytes(48).toString("hex");
  const doc = await Token.create({
    user: userId,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
    ip: meta.ip || null,
    userAgent: meta.userAgent
      ? String(meta.userAgent).slice(0, MAX_USER_AGENT_LENGTH)
      : null,
  });
  return { token, sessionId: doc._id };
};

const issueTokenPair = async (
  userId: string | Types.ObjectId,
  meta: SessionMeta = {}
): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: Types.ObjectId;
  tokenType: string;
  expiresIn: number;
}> => {
  const { token, sessionId } = await issueRefreshToken(userId, meta);
  return {
    accessToken: signAccessToken(userId),
    refreshToken: token,
    sessionId,
    tokenType: "Bearer",
    expiresIn: env.ACCESS_TOKEN_TTL,
  };
};

const refreshAccessToken = async (
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: Types.ObjectId;
  tokenType: string;
  expiresIn: number;
}> => {
  const tokenDoc = await Token.findOne({ hash: hashToken(refreshToken) });
  if (!tokenDoc) {
    throw new AuthenticationError("Invalid refresh token");
  }
  if (tokenDoc.revokedAt) {
    await Token.updateMany(
      { user: tokenDoc.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw new AuthenticationError(
      "Refresh token reuse detected — all sessions revoked"
    );
  }
  if (tokenDoc.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token expired");
  }
  const user = await User.findById(tokenDoc.user);
  if (!user) {
    throw new AuthenticationError("User no longer exists");
  }

  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();
  return issueTokenPair(user._id, {
    ip: tokenDoc.ip,
    userAgent: tokenDoc.userAgent,
  });
};

const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  await Token.updateOne(
    { hash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const revokeAllUserTokens = async (
  userId: string | Types.ObjectId
): Promise<void> => {
  await Token.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const listUserSessions = (userId: string | Types.ObjectId) =>
  Token.find({
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("ip userAgent createdAt expiresAt")
    .sort({ createdAt: -1 })
    .lean();

const revokeSessionById = async (
  userId: string | Types.ObjectId,
  sessionId: string | Types.ObjectId
): Promise<void> => {
  const result = await Token.updateOne(
    { _id: sessionId, user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    throw new NotFoundError("Session not found");
  }
};

authenticator.options = { window: 1 };

const buildTotpSetup = (
  username: string
): { secret: string; otpauthUri: string } => {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(username, "TaskAPI", secret);
  return { secret, otpauthUri };
};

const isTotpValid = (secret: string, token: unknown): boolean => {
  try {
    return authenticator.check(String(token), secret);
  } catch {
    return false;
  }
};

const createChallengeToken = (userId: string | Types.ObjectId): string =>
  jwt.sign(
    {
      userId: String(userId),
      purpose: "2fa_challenge",
    } satisfies ChallengeTokenPayload,
    env.JWT_SECRET,
    {
      expiresIn: CHALLENGE_TTL,
    }
  );

const verifyChallengeToken = (token: string): string => {
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AuthenticationError("Invalid or expired challenge token");
  }
  if (typeof payload === "string" || payload.purpose !== "2fa_challenge") {
    throw new AuthenticationError("Invalid challenge token");
  }
  return payload.userId as string;
};

const newRecoveryCodes = (): string[] =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(8).toString("hex")
  );

type RecoveryCodeEntry = NonNullable<UserAttrs["recoveryCodes"]>[number];

const matchUnusedRecoveryCode = (
  user: UserDocument,
  code: unknown
): RecoveryCodeEntry | null => {
  if (!code || !Array.isArray(user.recoveryCodes)) return null;
  const hash = hashToken(String(code));
  const entry = user.recoveryCodes.find(
    (rc) => rc.codeHash === hash && !rc.usedAt
  );
  if (!entry) return null;
  entry.usedAt = new Date();
  return entry;
};

export {
  issueTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  listUserSessions,
  revokeSessionById,
  buildTotpSetup,
  isTotpValid,
  createChallengeToken,
  verifyChallengeToken,
  newRecoveryCodes,
  matchUnusedRecoveryCode,
  hashToken,
  getOrCreateFeedToken,
  rotateFeedToken,
  findUserByFeedToken,
};
