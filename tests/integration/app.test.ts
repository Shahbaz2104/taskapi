import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let mongo: MongoMemoryServer;
let app: Express;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = "test-secret";

  const db = await import("../../src/config/db.js");
  await db.connectDB();
  closeDb = db.disconnectDB;

  const { createApp } = await import("../../src/app.js");
  app = createApp();
}, 60000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
}, 30000);

interface Pair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

const auth = async (
  username: string,
  email: string,
  password = "secret1"
): Promise<{ pair: Pair; userId: string }> => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ username, email, password });
  expect(res.status).toBe(201);
  return {
    pair: res.body as Pair,
    userId: String(res.body.userId),
  };
};

describe("new TS tree boot", () => {
  it("serves /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("registers with validation errors on bad payload", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "ab", email: "not-an-email", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^body\./);
  });
});

describe("new TS tree auth + tasks flow", () => {
  let alice: { pair: Pair; userId: string };
  let taskId: string;

  beforeAll(async () => {
    alice = await auth("alice-it", "alice-it@example.com");
  });

  it("returns the authenticated profile", async () => {
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice-it");
    expect(res.body.email).toBe("alice-it@example.com");
    expect(typeof res.body._id).toBe("string");
    expect(res.body.password).toBeUndefined();
    expect(res.body.totpEnabled).toBe(false);
  });

  it("creates and validates tasks", async () => {
    const bad = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`)
      .send({ priority: "high" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/^body\.title:/);

    const good = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`)
      .send({ title: "Write integration spec", priority: "high" });
    expect(good.status).toBe(201);
    expect(good.body.status).toBe("pending");
    taskId = String(good.body._id);
  });

  it("lists tasks with the paginated envelope", async () => {
    const res = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(Object.keys(res.body)).toEqual(
      expect.arrayContaining(["tasks", "total", "page", "limit", "totalPages"])
    );
  });

  it("updates through the owner path", async () => {
    const res = await request(app)
      .put(`/api/v1/tasks/${taskId}`)
      .set("Authorization", `Bearer ${alice.pair.accessToken}`)
      .send({ description: "updated by integration test" });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("updated by integration test");
  });

  it("trashes, lists trash, restores via bulk", async () => {
    const trash = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`)
      .send({ ids: [taskId], action: "trash" });
    expect(trash.status).toBe(200);
    expect(trash.body.modified).toBe(1);

    const bin = await request(app)
      .get("/api/v1/tasks/trash")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`);
    expect(bin.body.total).toBe(1);

    const restore = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set("Authorization", `Bearer ${alice.pair.accessToken}`)
      .send({ ids: [taskId], action: "restore" });
    expect(restore.body.modified).toBe(1);
  });

  it("logs in with valid credentials and rejects bad ones", async () => {
    const bad = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "alice-it", password: "wrong-pass" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid credentials");

    const ok = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "alice-it", password: "secret1" });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeDefined();
    expect(ok.body.sessionId).toBeDefined();
  });

  it("refreshes via rotation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: alice.pair.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(alice.pair.refreshToken);

    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: alice.pair.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toContain("reuse detected");
  });
});
