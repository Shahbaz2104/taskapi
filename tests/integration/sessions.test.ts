import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

let mongoServer: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = "test-secret";

  const [{ default: authRoutes }, { default: userRoutes }, { errorHandler }] =
    await Promise.all([
      import("../../src/routes/auth.routes.js"),
      import("../../src/routes/user.routes.js"),
      import("../../src/middleware/error_handler.js"),
    ]);

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

interface Pair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

const registerAndLogin = async (
  username = "sessuser"
): Promise<Pair> => {
  await request(app).post("/api/v1/auth/register").send({
    username,
    email: `${username}@example.com`,
    password: "password1",
  });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ username, password: "password1" });
  return res.body as Pair;
};

describe("Sessions / devices", () => {
  it("token pair responses include a sessionId", async () => {
    const body = await registerAndLogin();
    expect(body.sessionId).toBeDefined();
    expect(body.accessToken).toBeDefined();
  });

  it("lists active sessions with metadata", async () => {
    const first = await registerAndLogin("multiuser");
    await request(app)
      .post("/api/v1/auth/login")
      .set("User-Agent", "pytest-agent/2.0")
      .send({ username: "multiuser", password: "password1" });

    const res = await request(app)
      .get("/api/v1/me/sessions")
      .set("Authorization", `Bearer ${first.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(3);
    expect(res.body.sessions[0].userAgent).toBe("pytest-agent/2.0");
    expect(res.body.sessions[0]._id).toBeDefined();
    expect(res.body.sessions[0].hash).toBeUndefined();
    expect(res.body.sessions[0].createdAt).toBeDefined();
    expect(res.body.sessions[0].expiresAt).toBeDefined();
  });

  it("expired sessions are not listed", async () => {
    const { Token } = await import("../../src/models/token.js");
    const body = await registerAndLogin("expiring");
    await Token.updateMany(
      { revokedAt: null },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const res = await request(app)
      .get("/api/v1/me/sessions")
      .set("Authorization", `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBe(0);
  });

  it("revokes a single session by id — its refresh token dies, others survive", async () => {
    const first = await registerAndLogin("revokeuser");
    const second = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "revokeuser", password: "password1" });

    const res = await request(app)
      .delete(`/api/v1/me/sessions/${second.body.sessionId}`)
      .set("Authorization", `Bearer ${first.accessToken}`);
    expect(res.status).toBe(204);

    const listRes = await request(app)
      .get("/api/v1/me/sessions")
      .set("Authorization", `Bearer ${first.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.sessions.length).toBe(2);

    const okRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first.refreshToken });
    expect(okRefresh.status).toBe(200);

    // Presenting the revoked refresh token is treated as theft — 401,
    // and reuse detection revokes all remaining sessions by design
    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: second.body.refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it("cannot revoke someone else's session or an unknown id", async () => {
    const mine = await registerAndLogin("owner");
    await registerAndLogin("stranger");
    const strangerLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "stranger", password: "password1" });
    const strangerSessions = await request(app)
      .get("/api/v1/me/sessions")
      .set("Authorization", `Bearer ${strangerLogin.body.accessToken}`);
    const foreignId = strangerSessions.body.sessions[0]._id;

    for (const target of [foreignId, "507f1f77bcf86cd799439011"]) {
      const res = await request(app)
        .delete(`/api/v1/me/sessions/${target}`)
        .set("Authorization", `Bearer ${mine.accessToken}`);
      expect(res.status).toBe(404);
    }
  });

  it("rejects malformed session ids with 400", async () => {
    const { accessToken } = await registerAndLogin("malformed");
    const res = await request(app)
      .delete("/api/v1/me/sessions/not-a-mongoid")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });
});
