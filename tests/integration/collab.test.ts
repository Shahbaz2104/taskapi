import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeEach, beforeAll, describe, expect, it } from "vitest";

let mongoServer: MongoMemoryServer;
let app: express.Express;
let token: string | undefined;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = "test-secret";

  const [
    { default: tasksRoutes },
    { default: authRoutes },
    { default: userRoutes },
    { errorHandler },
  ] = await Promise.all([
    import("../../src/routes/tasks.routes.js"),
    import("../../src/routes/auth.routes.js"),
    import("../../src/routes/user.routes.js"),
    import("../../src/middleware/error_handler.js"),
  ]);

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes as unknown as express.Router);
  app.use("/api/v1/tasks", tasksRoutes as unknown as express.Router);
  app.use("/api/v1/me", userRoutes as unknown as express.Router);
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
  token = undefined;
});

const asUser = async (username: string): Promise<string> => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({
      username,
      email: `${username}@example.com`,
      password: "password1",
    });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ username, password: "password1" });
  return res.body.accessToken;
};

const auth = (tok = token): { Authorization: string } => ({
  Authorization: `Bearer ${tok}`,
});

describe("collaboration", () => {
  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let strangerToken: string;
  let taskId: string;

  beforeEach(async () => {
    ownerToken = await asUser("alice");
    editorToken = await asUser("bob");
    viewerToken = await asUser("carol");
    strangerToken = await asUser("mallory");

    token = ownerToken;
    taskId = (
      await request(app)
        .post("/api/v1/tasks")
        .set(auth())
        .send({ title: "Shared plan", description: "top secret" })
    ).body._id;

    await request(app)
      .post(`/api/v1/tasks/${taskId}/shares`)
      .set(auth())
      .send({ username: "bob", role: "editor" });
    await request(app)
      .post(`/api/v1/tasks/${taskId}/shares`)
      .set(auth())
      .send({ username: "carol", role: "viewer" });
  });

  it("owner can manage shares; duplicates and unknown users are rejected", async () => {
    const dup = await request(app)
      .post(`/api/v1/tasks/${taskId}/shares`)
      .set(auth())
      .send({ username: "bob", role: "editor" });
    expect(dup.status).toBe(409);

    const unknown = await request(app)
      .post(`/api/v1/tasks/${taskId}/shares`)
      .set(auth())
      .send({ username: "ghost", role: "viewer" });
    expect(unknown.status).toBe(400);

    const selfShare = await request(app)
      .post(`/api/v1/tasks/${taskId}/shares`)
      .set(auth())
      .send({ username: "alice", role: "viewer" });
    expect(selfShare.status).toBe(400);

    const list = await request(app)
      .get(`/api/v1/tasks/${taskId}/shares`)
      .set(auth());
    expect(list.body.shares).toHaveLength(2);
    expect(
      list.body.shares
        .map((s: { user: { username: string } }) => s.user.username)
        .sort()
    ).toEqual(["bob", "carol"]);
  });

  it("non-owners cannot see or manage shares — indistinguishable 404s", async () => {
    for (const tok of [editorToken, viewerToken, strangerToken]) {
      const list = await request(app)
        .get(`/api/v1/tasks/${taskId}/shares`)
        .set(auth(tok));
      expect(list.status).toBe(404);

      const grant = await request(app)
        .post(`/api/v1/tasks/${taskId}/shares`)
        .set(auth(tok))
        .send({ username: "mallory", role: "editor" });
      expect(grant.status).toBe(404);
    }
  });

  it("strangers get 404 for detail, comments, activity — existence not leaked", async () => {
    for (const path of [
      `/api/v1/tasks/${taskId}`,
      `/api/v1/tasks/${taskId}/comments`,
      `/api/v1/tasks/${taskId}/activity`,
      `/api/v1/tasks/${taskId}/shares`,
    ]) {
      const res = await request(app).get(path).set(auth(strangerToken));
      expect(res.status).toBe(404);
    }
    const sharedList = await request(app)
      .get("/api/v1/me/shared")
      .set(auth(strangerToken));
    expect(sharedList.body.shared).toHaveLength(0);
  });

  it("viewers read task, comments, activity but cannot comment", async () => {
    token = ownerToken;
    await request(app)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth())
      .send({ body: "owner note" });

    const detail = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set(auth(viewerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.title).toBe("Shared plan");

    const comments = await request(app)
      .get(`/api/v1/tasks/${taskId}/comments`)
      .set(auth(viewerToken));
    expect(comments.status).toBe(200);
    expect(comments.body.comments[0].user.username).toBe("alice");

    const activity = await request(app)
      .get(`/api/v1/tasks/${taskId}/activity`)
      .set(auth(viewerToken));
    expect(activity.status).toBe(200);
    expect(
      activity.body.activity.some(
        (a: { action: string }) => a.action === "share.granted"
      )
    ).toBe(true);

    const denied = await request(app)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth(viewerToken))
      .send({ body: "viewer cannot speak" });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toContain("Editor access required");

    const noEdit = await request(app)
      .put(`/api/v1/tasks/${taskId}`)
      .set(auth(viewerToken))
      .send({ title: "hijacked" });
    expect(noEdit.status).toBe(404); // below editor rank collapses to 404

    const sharedList = await request(app)
      .get("/api/v1/me/shared")
      .set(auth(viewerToken));
    expect(sharedList.body.shared).toHaveLength(1);
    expect(sharedList.body.shared[0].myRole).toBe("viewer");
  });

  it("editors comment and update the task, but cannot delete or manage shares", async () => {
    const commented = await request(app)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth(editorToken))
      .send({ body: "editor checking in" });
    expect(commented.status).toBe(201);

    const updated = await request(app)
      .put(`/api/v1/tasks/${taskId}`)
      .set(auth(editorToken))
      .send({ status: "completed" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("completed");

    const ownerView = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set(auth(ownerToken));
    expect(ownerView.body.status).toBe("completed");

    const del = await request(app)
      .delete(`/api/v1/tasks/${taskId}`)
      .set(auth(editorToken));
    expect(del.status).toBe(404);

    const shares = await request(app)
      .get(`/api/v1/tasks/${taskId}/shares`)
      .set(auth(editorToken));
    expect(shares.status).toBe(404);
  });

  it("revoking a share removes the collaborator's access immediately", async () => {
    const shares = await request(app)
      .get(`/api/v1/tasks/${taskId}/shares`)
      .set(auth());
    const carolsShare = shares.body.shares.find(
      (s: { user: { username: string } }) => s.user.username === "carol"
    );

    const before = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set(auth(viewerToken));
    expect(before.status).toBe(200);

    const revoked = await request(app)
      .delete(`/api/v1/tasks/${taskId}/shares/${carolsShare._id}`)
      .set(auth());
    expect(revoked.status).toBe(204);

    const after = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set(auth(viewerToken));
    expect(after.status).toBe(404);

    const activity = await request(app)
      .get(`/api/v1/tasks/${taskId}/activity`)
      .set(auth());
    expect(
      activity.body.activity.some(
        (a: { action: string }) => a.action === "share.revoked"
      )
    ).toBe(true);
  });

  it("trashing the task hides it from collaborators and blocks new comments", async () => {
    await request(app).delete(`/api/v1/tasks/${taskId}`).set(auth());

    const editorView = await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set(auth(editorToken));
    expect(editorView.status).toBe(404);

    const lateComment = await request(app)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth(editorToken))
      .send({ body: "too late" });
    expect(lateComment.status).toBe(404);
  });

  it("comment payloads are zod-validated", async () => {
    const empty = await request(app)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth())
      .send({ body: "" });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("body.body");
  });
});
