const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/users_models.js");
const Token = require("../models/token_models.js");

const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL) || 900;
const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL) || 604800;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

const MAX_USER_AGENT_LENGTH = 256;

const issueRefreshToken = async (userId, meta = {}) => {
  const token = crypto.randomBytes(48).toString("hex");
  const doc = await Token.create({
    user: userId,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
    ip: meta.ip || null,
    userAgent: meta.userAgent
      ? String(meta.userAgent).slice(0, MAX_USER_AGENT_LENGTH)
      : null,
  });
  return { token, sessionId: doc._id };
};

const issueTokenPair = async (userId, meta = {}) => {
  const { token, sessionId } = await issueRefreshToken(userId, meta);
  return {
    accessToken: signAccessToken(userId),
    refreshToken: token,
    sessionId,
    tokenType: "Bearer",
    expiresIn: ACCESS_TTL,
  };
};

const refreshAccessToken = async (refreshToken) => {
  const tokenDoc = await Token.findOne({ hash: hashToken(refreshToken) });
  if (!tokenDoc) {
    throw Object.assign(new Error("Invalid refresh token"), { status: 401 });
  }
  if (tokenDoc.revokedAt) {
    // A revoked token being used again means it was stolen —
    // revoke every session for that user.
    await Token.updateMany(
      { user: tokenDoc.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw Object.assign(
      new Error("Refresh token reuse detected — all sessions revoked"),
      { status: 401 }
    );
  }
  if (tokenDoc.expiresAt < new Date()) {
    throw Object.assign(new Error("Refresh token expired"), { status: 401 });
  }
  const user = await User.findById(tokenDoc.user);
  if (!user) {
    throw Object.assign(new Error("User no longer exists"), { status: 401 });
  }

  // Rotation: the presented token is revoked and a new pair is issued —
  // the replacement carries the same session metadata (same device)
  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();
  return issueTokenPair(user._id, {
    ip: tokenDoc.ip,
    userAgent: tokenDoc.userAgent,
  });
};

const revokeRefreshToken = async (refreshToken) => {
  await Token.updateOne(
    { hash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const revokeAllUserTokens = async (userId) => {
  await Token.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

// Active session = issued, not revoked, and not expired yet
const listUserSessions = async (userId) =>
  Token.find({
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("ip userAgent createdAt expiresAt")
    .sort({ createdAt: -1 })
    .lean();

const revokeSessionById = async (userId, sessionId) => {
  const result = await Token.updateOne(
    { _id: sessionId, user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
};

module.exports = {
  issueTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  listUserSessions,
  revokeSessionById,
  hashToken,
};
