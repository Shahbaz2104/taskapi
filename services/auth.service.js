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

const issueRefreshToken = async (userId) => {
  const token = crypto.randomBytes(48).toString("hex");
  await Token.create({
    user: userId,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
  });
  return token;
};

const issueTokenPair = async (userId) => ({
  accessToken: signAccessToken(userId),
  refreshToken: await issueRefreshToken(userId),
  tokenType: "Bearer",
  expiresIn: ACCESS_TTL,
});

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

  // Rotation: the presented token is revoked and a new pair is issued
  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();
  return issueTokenPair(user._id);
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

module.exports = {
  issueTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  hashToken,
};
