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

const login = async (username = "importuser"): Promise<void> => {
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

interface TaskLike {
  _id: string;
  title: string;
}

describe("POST /tasks/import", () => {
  it("imports a JSON array and the tasks become visible", async () => {
    await login();
    const res = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send({
        tasks: [
          { title: "From JSON", priority: "high", tags: ["a", "b"] },
          { title: "Second", dueDate: "2026-09-01T10:00:00Z" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.failed).toEqual([]);

    const list = await request(app).get("/api/v1/tasks").set(auth());
    expect(list.body.tasks).toHaveLength(2);
    expect(list.body.total).toBe(2);
  });

  it("accepts a bare top-level array too", async () => {
    await login();
    const res = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send([{ title: "Bare array task" }]);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
  });

  it("reports per-row failures without aborting valid rows", async () => {
    await login();
    const res = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send({
        tasks: [
          { title: "Good one" },
          { description: "missing title" },
          { title: "Bad status", status: "archived" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.failed).toHaveLength(2);
    expect(res.body.failed[0]).toMatchObject({ row: 1 });
    expect(res.body.failed[0].error).toContain("title is required");
    expect(res.body.failed[1]).toMatchObject({ row: 2 });
    expect(res.body.failed[1].error).toContain('invalid status "archived"');
  });

  it("rejects imports over the 500-row cap", async () => {
    await login();
    const rows = Array.from({ length: 501 }, (_, i) => ({
      title: `Task ${i}`,
    }));
    const res = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send({ tasks: rows });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("500");
  });

  it("parses raw CSV including quoted commas and semicolon tags", async () => {
    await login();
    const csv =
      "Title,Description,Status,DueDate,Tags\n" +
      '"Fix bug, urgent","Needs review\nwith newline",in_progress,2026-09-05T08:00:00Z,"backend;api"\n' +
      "Plain one,pending,,,\n";
    const res = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .set("Content-Type", "text/csv")
      .send(csv);

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);

    const list = await request(app).get("/api/v1/tasks").set(auth());
    const fixed = (list.body.tasks as TaskLike[]).find(
      (t) => t.title === "Fix bug, urgent"
    ) as unknown as Record<string, unknown>;
    expect(fixed.status).toBe("in_progress");
    expect(fixed.tags).toEqual(["backend", "api"]);
    expect(fixed.dueDate).toBeTruthy();

    const plain = (list.body.tasks as TaskLike[]).find(
      (t) => t.title === "Plain one"
    ) as unknown as Record<string, unknown>;
    expect(plain.status).toBe("pending");
  });

  it("rejects empty JSON and header-only CSV payloads", async () => {
    await login();
    const emptyJson = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send({ tasks: [] });
    expect(emptyJson.status).toBe(400);

    const noTasksKey = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .send({ something: true });
    expect(noTasksKey.status).toBe(400);

    const headerOnly = await request(app)
      .post("/api/v1/tasks/import")
      .set(auth())
      .set("Content-Type", "text/csv")
      .send("Title\n");
    expect(headerOnly.status).toBe(400);
  });

  it("replays the original response for a repeated Idempotency-Key", async () => {
    await login();
    const sendImport = (): request.Test =>
      request(app)
        .post("/api/v1/tasks/import")
        .set(auth())
        .set("Idempotency-Key", "import-once-123")
        .send({
          tasks: [{ title: "Only once" }, { description: "no title here" }],
        });

    const first = await sendImport();
    expect(first.body.imported).toBe(1);

    const replay = await sendImport();
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const list = await request(app).get("/api/v1/tasks").set(auth());
    expect(list.body.total).toBe(1); // no duplicates created
  });
});

describe("iCal calendar feed", () => {
  it("requires and validates the feed token", async () => {
    const noToken = await request(app).get("/api/v1/tasks/calendar.ics");
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get("/api/v1/tasks/calendar.ics")
      .query({ token: "not-a-real-token" });
    expect(badToken.status).toBe(401);
  });

  it("serves a VCALENDAR with events for valid tokens", async () => {
    await login();
    await request(app).post("/api/v1/tasks").set(auth()).send({
      title: "Calendar event, with comma",
      dueDate: "2026-09-10T14:00:00Z",
    });
    const done = await request(app)
      .post("/api/v1/tasks")
      .set(auth())
      .send({ title: "Done thing", dueDate: "2026-09-11T14:00:00Z" });
    // complete the second task so STATUS:CANCELLED appears
    await request(app)
      .put(`/api/v1/tasks/${done.body._id}`)
      .set(auth())
      .send({ status: "completed" });

    const settings = await request(app)
      .get("/api/v1/me/calendar-feed")
      .set(auth());
    expect(settings.status).toBe(200);
    expect(settings.body.token).toMatch(/^[0-9a-f]{64}$/);

    const feed = await request(app).get(
      `/api/v1/tasks/calendar.ics?token=${settings.body.token}`
    );
    expect(feed.status).toBe(200);
    expect(feed.headers["content-type"]).toContain("text/calendar");
    expect(feed.text).toContain("BEGIN:VCALENDAR");
    expect(feed.text).toContain("SUMMARY:Calendar event\\, with comma");
    expect(feed.text).toContain("STATUS:CANCELLED");
    expect(feed.text).toContain("END:VCALENDAR");
  });

  it("excludes trashed tasks from the feed", async () => {
    await login();
    const created = await request(app)
      .post("/api/v1/tasks")
      .set(auth())
      .send({ title: "Trash me before feed" });
    await request(app).delete(`/api/v1/tasks/${created.body._id}`).set(auth());

    const settings = await request(app)
      .get("/api/v1/me/calendar-feed")
      .set(auth());
    const feed = await request(app).get(
      `/api/v1/tasks/calendar.ics?token=${settings.body.token}`
    );
    expect(feed.text).not.toContain("Trash me before feed");
  });

  it("rotating the token invalidates the old feed URL", async () => {
    await login();
    const first = await request(app)
      .get("/api/v1/me/calendar-feed")
      .set(auth());
    const rotated = await request(app)
      .post("/api/v1/me/calendar-feed/rotate")
      .set(auth());

    expect(rotated.body.token).not.toBe(first.body.token);

    const oldFeed = await request(app).get(
      `/api/v1/tasks/calendar.ics?token=${first.body.token}`
    );
    expect(oldFeed.status).toBe(401);

    const newFeed = await request(app).get(
      `/api/v1/tasks/calendar.ics?token=${rotated.body.token}`
    );
    expect(newFeed.status).toBe(200);
  });
});
