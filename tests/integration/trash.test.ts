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

  const [{ default: tasksRoutes }, { default: authRoutes }, { errorHandler }] =
    await Promise.all([
      import("../../src/routes/tasks.routes.js"),
      import("../../src/routes/auth.routes.js"),
      import("../../src/middleware/error_handler.js"),
    ]);

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes as unknown as express.Router);
  app.use("/api/v1/tasks", tasksRoutes as unknown as express.Router);
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

const login = async (username = "trashuser"): Promise<void> => {
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
  token = res.body.accessToken;
};

const auth = (): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

interface TaskBody {
  _id: string;
  status?: string;
  priority?: string;
}

const createTask = async (
  overrides: Record<string, unknown> = {}
): Promise<TaskBody> =>
  (
    await request(app)
      .post("/api/v1/tasks")
      .set(auth())
      .send({ title: `Task ${Math.random()}`, ...overrides })
  ).body;

describe("Soft-delete trash", () => {
  it("DELETE /tasks/:id soft-deletes — hidden from list/get/stats, visible in trash", async () => {
    await login();
    const a = await createTask({ title: "Doomed A" });
    await createTask({ title: "Survivor" });

    const del = await request(app).delete(`/api/v1/tasks/${a._id}`).set(auth());
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/v1/tasks").set(auth());
    expect(list.body.total).toBe(1);
    expect(list.body.tasks[0].title).toBe("Survivor");

    const gone = await request(app).get(`/api/v1/tasks/${a._id}`).set(auth());
    expect(gone.status).toBe(404);

    const stats = await request(app).get("/api/v1/tasks/stats").set(auth());
    expect(stats.body.total).toBe(1);

    const trash = await request(app).get("/api/v1/tasks/trash").set(auth());
    expect(trash.status).toBe(200);
    expect(trash.body.total).toBe(1);
    expect(trash.body.tasks[0]._id).toBe(a._id);
    expect(trash.body.tasks[0].deletedAt).toBeTruthy();
  });

  it("trashed tasks cannot be updated or re-completed", async () => {
    await login();
    const t = await createTask();

    await request(app).delete(`/api/v1/tasks/${t._id}`).set(auth());

    const upd = await request(app)
      .put(`/api/v1/tasks/${t._id}`)
      .set(auth())
      .send({ title: "Zombie" });
    expect(upd.status).toBe(404);

    const complete = await request(app)
      .put(`/api/v1/tasks/${t._id}`)
      .set(auth())
      .send({ status: "completed" });
    expect(complete.status).toBe(404);
  });

  it("restore brings tasks back to the live list", async () => {
    await login();
    const t = await createTask();
    await request(app).delete(`/api/v1/tasks/${t._id}`).set(auth());

    const res = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [t._id], action: "restore" });
    expect(res.status).toBe(200);
    expect(res.body.modified).toBe(1);

    const list = await request(app).get("/api/v1/tasks").set(auth());
    expect(list.body.total).toBe(1);

    const trash = await request(app).get("/api/v1/tasks/trash").set(auth());
    expect(trash.body.total).toBe(0);
  });

  it("purge removes permanently; emptyTrash clears everything", async () => {
    await login();
    const otherTrashed = await createTask({ title: "Keep me trashed" });
    const doomed = await createTask({ title: "Purge me" });

    await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [otherTrashed._id, doomed._id], action: "trash" });

    const purge = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [doomed._id], action: "purge" });
    expect(purge.status).toBe(200);
    expect(purge.body.modified).toBe(1);

    const restore = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [doomed._id], action: "restore" });
    expect(restore.body.modified).toBe(0);

    const clear = await request(app).delete("/api/v1/tasks/trash").set(auth());
    expect(clear.status).toBe(200);
    expect(clear.body.deleted).toBe(1);

    const trash = await request(app).get("/api/v1/tasks/trash").set(auth());
    expect(trash.body.total).toBe(0);
  });

  it("CSV export excludes trashed tasks", async () => {
    await login();
    await createTask({ title: "Exported" });
    const trashed = await createTask({ title: "Hidden from CSV" });
    await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [trashed._id], action: "trash" });

    const csv = await request(app).get("/api/v1/tasks/export").set(auth());
    expect(csv.text).toContain("Exported");
    expect(csv.text).not.toContain("Hidden from CSV");
  });
});

describe("Bulk operations", () => {
  it("completes many tasks at once without spawning recurrences", async () => {
    await login();
    const recurring = await createTask({
      recurrence: "daily",
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    const plain = await createTask();

    const res = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({
        ids: [recurring._id, plain._id],
        action: "complete",
      });
    expect(res.status).toBe(200);
    expect(res.body.modified).toBe(2);
    expect(res.body.action).toBe("complete");

    // Deliberately no successor spawn on bulk completion
    const list = await request(app).get("/api/v1/tasks").set(auth());
    expect(list.body.total).toBe(2);
    const statuses = (list.body.tasks as Array<{ status: string }>).map(
      (t) => t.status
    );
    expect(statuses.every((s) => s === "completed")).toBe(true);
  });

  it("sets priority in bulk", async () => {
    await login();
    const a = await createTask();
    const b = await createTask();

    const res = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [a._id, b._id], action: "priority", priority: "high" });
    expect(res.body.modified).toBe(2);

    const list = await request(app)
      .get("/api/v1/tasks?sort=priority")
      .set(auth());
    expect(
      (list.body.tasks as Array<{ priority: string }>).every(
        (t) => t.priority === "high"
      )
    ).toBe(true);
  });

  it("validates ids, actions, and the priority requirement", async () => {
    await login();

    const badAction = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: ["507f1f77bcf86cd799439011"], action: "explode" });
    expect(badAction.status).toBe(400);

    const badId = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: ["not-an-id"], action: "complete" });
    expect(badId.status).toBe(400);

    const missingPriority = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: ["507f1f77bcf86cd799439011"], action: "priority" });
    expect(missingPriority.status).toBe(400);

    const tooMany = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({
        ids: Array.from({ length: 101 }, (_, i) => String(i).padStart(24, "5")),
        action: "trash",
      });
    expect(tooMany.status).toBe(400);
  });

  it("bulk operations never touch other users' tasks", async () => {
    await login("alice-bulk");
    const mine = await createTask({ title: "Mine" });

    await request(app).post("/api/v1/auth/register").send({
      username: "bob-bulk",
      email: "bob@example.com",
      password: "password1",
    });
    const bobToken = (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ username: "bob-bulk", password: "password1" })
    ).body.accessToken;

    const bobTask = (
      await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ title: "Bob's task" })
    ).body;

    const res = await request(app)
      .patch("/api/v1/tasks/bulk")
      .set(auth())
      .send({ ids: [mine._id, bobTask._id], action: "trash" });
    expect(res.body.matched).toBe(1);

    const bobList = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(bobList.body.total).toBe(1);
  });
});
