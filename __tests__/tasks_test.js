jest.setTimeout(30000);

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");

const User = require("../models/users_models.js");
const Task = require("../models/tasks_models.js");
const Token = require("../models/token_models.js");

let mongoServer;
let app;
let token;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  const tasksRoutes = require("../routes/tasks_routes");
  const authRoutes = require("../routes/auth_routes");
  const userRoutes = require("../routes/user_routes");
  const adminRoutes = require("../routes/admin_routes");
  const errorHandler = require("../middleware/error_handler");

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/tasks", tasksRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  token = undefined;
});

const registerAndLogin = async (
  username = "taskuser",
  email = "taskuser@example.com",
  password = "taskpass"
) => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ username, email, password });
  const loginRes = await request(app)
    .post("/api/v1/auth/login")
    .send({ username, password });
  return loginRes.body.accessToken;
};

describe("Auth Routes", () => {
  it("registers a new user with a token pair", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "testpass",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("User created");
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.tokenType).toBe("Bearer");
  });

  it("returns a verification URL when SMTP is not configured", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "verifyuser",
      email: "verify@example.com",
      password: "testpass",
    });
    expect(res.status).toBe(201);
    expect(res.body.verificationUrl).toContain("/verify-email?token=");
  });

  it("rejects duplicate registration", async () => {
    await request(app).post("/api/v1/auth/register").send({
      username: "dupuser",
      email: "dup@example.com",
      password: "testpass",
    });
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "dupuser",
      email: "dup@example.com",
      password: "testpass",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("User exists");
  });

  it("rejects a duplicate email with a different username", async () => {
    await request(app).post("/api/v1/auth/register").send({
      username: "firstuser",
      email: "shared@example.com",
      password: "testpass",
    });
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "seconduser",
      email: "shared@example.com",
      password: "testpass",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing fields on register", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({});
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email on register", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "badmail",
      email: "not-an-email",
      password: "validpass",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a weak password on register", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "weakpass",
      email: "weak@example.com",
      password: "123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Password/);
  });

  it("rejects a short username on register", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ username: "ab", email: "ab@example.com", password: "validpass" });
    expect(res.status).toBe(400);
  });

  it("logs in and returns a token pair", async () => {
    await request(app).post("/api/v1/auth/register").send({
      username: "loginuser",
      email: "login@example.com",
      password: "loginpass",
    });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "loginuser", password: "loginpass" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    token = res.body.accessToken;
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "nobody", password: "wrong" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("refreshes a token pair and rotates the refresh token", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      username: "refreshuser",
      email: "refresh@example.com",
      password: "testpass",
    });
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(reg.body.refreshToken);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(401);
  });

  it("detects refresh token reuse and revokes all sessions", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      username: "reuseuser",
      email: "reuse@example.com",
      password: "testpass",
    });
    const secondLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "reuseuser", password: "testpass" });

    // Rotate once — first refresh token is now revoked
    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });

    // Reusing the revoked token must fail AND kill the other session
    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(reuse.status).toBe(401);

    const other = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: secondLogin.body.refreshToken });
    expect(other.status).toBe(401);
  });

  it("revokes a refresh token on logout", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      username: "logoutuser",
      email: "logout@example.com",
      password: "testpass",
    });
    const out = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: reg.body.refreshToken });
    expect(out.status).toBe(204);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(401);
  });

  it("verifies an email with the emailed token", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      username: "mailuser",
      email: "mail@example.com",
      password: "testpass",
    });
    const verifyToken = new URL(reg.body.verificationUrl).searchParams.get(
      "token"
    );
    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: verifyToken });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified");

    const user = await User.findOne({ username: "mailuser" });
    expect(user.emailVerified).toBe(true);
  });

  it("rejects an invalid verification token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: "bogus" });
    expect(res.status).toBe(400);
  });

  it("resets a password with the emailed token", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      username: "resetuser",
      email: "reset@example.com",
      password: "oldpass1",
    });

    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "reset@example.com" });
    expect(forgot.status).toBe(200);
    expect(forgot.body.message).toMatch(/reset link/);

    const user = await User.findOne({ username: "resetuser" });
    const resetToken = jwt.sign({ userId: user._id }, "test-secret", {
      expiresIn: "30m",
    });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: resetToken, password: "newpass1" });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "resetuser", password: "newpass1" });
    expect(login.status).toBe(200);

    const oldRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: reg.body.refreshToken });
    expect(oldRefresh.status).toBe(401);
  });

  it("does not reveal whether an email exists on forgot-password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ghost@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link/);
  });
});

describe("Tasks Routes", () => {
  beforeEach(async () => {
    token = await registerAndLogin();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/tasks");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", "Bearer not.a.valid.token");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
  });

  it("creates a task", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Test Task", description: "Test description" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Test Task");
    expect(res.body.status).toBe("pending");
    expect(res.body.priority).toBe("medium");
  });

  it("creates a task with priority, due date, and tags", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Urgent Work",
        priority: "high",
        dueDate: "2026-12-01T00:00:00.000Z",
        tags: ["work", "urgent"],
      });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe("high");
    expect(res.body.tags).toEqual(["work", "urgent"]);
    expect(new Date(res.body.dueDate).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z"
    );
  });

  it("rejects task without title", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects a task with an over-long title", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid priority", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task", priority: "urgent" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid due date", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task", dueDate: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rejects more than 5 tags", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task", tags: ["a", "b", "c", "d", "e", "f"] });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid recurrence", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task", recurrence: "yearly" });
    expect(res.status).toBe(400);
  });

  it("gets all tasks for the user", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task 1" });
    const res = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it("paginates tasks", async () => {
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: `Task ${i}` });
    }
    const res = await request(app)
      .get("/api/v1/tasks?page=2&limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(2);
  });

  it("filters tasks by status including in_progress", async () => {
    const done = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "In Progress Task" });
    await request(app)
      .put(`/api/v1/tasks/${done.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "in_progress" });

    const res = await request(app)
      .get("/api/v1/tasks?status=in_progress")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.tasks[0].title).toBe("In Progress Task");
  });

  it("rejects an invalid status filter", async () => {
    const res = await request(app)
      .get("/api/v1/tasks?status=bogus")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Status must be pending, in_progress or completed"
    );
  });

  it("rejects an invalid sort param", async () => {
    const res = await request(app)
      .get("/api/v1/tasks?sort=bogus")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("searches tasks by keyword, scoped to the user", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Buy groceries", description: "Milk and eggs" });
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Pay rent" });

    const otherToken = await registerAndLogin(
      "otheruser",
      "other@example.com",
      "otherpass"
    );
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ title: "Buy groceries too" });

    const res = await request(app)
      .get("/api/v1/tasks?search=groceries")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.tasks[0].title).toBe("Buy groceries");
  });

  it("sorts tasks by due date", async () => {
    const dates = [
      "2026-06-01T00:00:00.000Z",
      "2025-01-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
    ];
    for (const dueDate of dates) {
      await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: `Task ${dueDate}`, dueDate });
    }
    const asc = await request(app)
      .get("/api/v1/tasks?sort=dueDate")
      .set("Authorization", `Bearer ${token}`);
    expect(asc.body.tasks[0].title).toContain("2025-01-01");

    const desc = await request(app)
      .get("/api/v1/tasks?sort=-dueDate")
      .set("Authorization", `Bearer ${token}`);
    expect(desc.body.tasks[0].title).toContain("2026-12-01");
  });

  it("sorts tasks by priority rank", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Low", priority: "low" });
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "High", priority: "high" });
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Medium", priority: "medium" });

    const res = await request(app)
      .get("/api/v1/tasks?sort=-priority")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.tasks[0].title).toBe("High");
    expect(res.body.tasks[1].title).toBe("Medium");
    expect(res.body.tasks[2].title).toBe("Low");
  });

  it("returns task stats", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Pending" });
    const inProgress = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "In Progress" });
    await request(app)
      .put(`/api/v1/tasks/${inProgress.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "in_progress" });
    const done = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Done" });
    await request(app)
      .put(`/api/v1/tasks/${done.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Overdue", dueDate: "2020-01-01T00:00:00.000Z" });

    const res = await request(app)
      .get("/api/v1/tasks/stats")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.byStatus.pending).toBe(2);
    expect(res.body.byStatus.in_progress).toBe(1);
    expect(res.body.byStatus.completed).toBe(1);
    expect(res.body.overdue).toBe(1);
    expect(res.body.completionRate).toBe(0.25);
  });

  it("exports tasks as CSV", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Export Me", priority: "high" });
    const res = await request(app)
      .get("/api/v1/tasks/export")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text).toContain("title");
    expect(res.text).toContain("Export Me");
    expect(res.text).toContain("high");
  });

  it("spawns the next occurrence when a recurring task is completed", async () => {
    const base = new Date("2026-06-01T00:00:00.000Z");
    const create = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Daily Standup",
        dueDate: base.toISOString(),
        recurrence: "daily",
      });

    const res = await request(app)
      .put(`/api/v1/tasks/${create.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.total).toBe(2);

    const next = list.body.tasks.find((t) => t.status === "pending");
    expect(next.title).toBe("Daily Standup");
    expect(new Date(next.dueDate) - base).toBe(24 * 60 * 60 * 1000);
  });

  it("does not spawn occurrences unless a recurring task is completed", async () => {
    const create = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Weekly Report", recurrence: "weekly" });
    await request(app)
      .put(`/api/v1/tasks/${create.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "in_progress" });
    const res = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.total).toBe(1);
  });

  it("deduplicates requests with the same Idempotency-Key", async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "key-123",
    };
    const first = await request(app)
      .post("/api/v1/tasks")
      .set(headers)
      .send({ title: "Once Only" });
    const second = await request(app)
      .post("/api/v1/tasks")
      .set(headers)
      .send({ title: "Once Only" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);

    const list = await request(app)
      .get("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.total).toBe(1);
  });

  it("gets a task by id", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Task" });
    const res = await request(app)
      .get(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("My Task");
  });

  it("rejects a malformed task id", async () => {
    const res = await request(app)
      .get("/api/v1/tasks/not-a-valid-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid task ID");
  });

  it("updates a task", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Old Title" });
    const res = await request(app)
      .put(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New Title");
  });

  it("rejects an empty update body", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("At least one field to update is required");
  });

  it("rejects an update body with only disallowed fields", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ user: "65f1b2c3d4e5f6a7b8c9d0e1" });
    expect(res.status).toBe(400);
  });

  it("does not allow reassigning a task to another user", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Task" });
    const res = await request(app)
      .put(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New Title", user: "65f1b2c3d4e5f6a7b8c9d0e1" });
    expect(res.status).toBe(200);
    expect(res.body.user).not.toBe("65f1b2c3d4e5f6a7b8c9d0e1");
  });

  it("rejects an invalid status on update", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "bogus" });
    expect(res.status).toBe(400);
  });

  it("deletes a task", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To Delete" });
    const res = await request(app)
      .delete(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it("does not allow access to another user's task", async () => {
    const createRes = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Private Task" });

    const otherToken = await registerAndLogin(
      "otheruser",
      "other@example.com",
      "otherpass"
    );

    const res = await request(app)
      .get(`/api/v1/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("returns a generic 500 when the database fails", async () => {
    const spy = jest
      .spyOn(Task, "create")
      .mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.error).not.toBe("boom");
  });
});

describe("Account Routes", () => {
  beforeEach(async () => {
    token = await registerAndLogin();
  });

  it("gets the profile", async () => {
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("taskuser");
    expect(res.body.email).toBe("taskuser@example.com");
    expect(res.body.password).toBeUndefined();
  });

  it("updates the email", async () => {
    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("new@example.com");
    expect(res.body.emailVerified).toBe(false);
  });

  it("rejects a taken email on update", async () => {
    await registerAndLogin("otheruser", "other@example.com", "otherpass");
    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "other@example.com" });
    expect(res.status).toBe(400);
  });

  it("changes the password and revokes refresh tokens", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "taskuser", password: "taskpass" });

    const res = await request(app)
      .put("/api/v1/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "taskpass", newPassword: "newpass1" });
    expect(res.status).toBe(200);

    const login2 = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "taskuser", password: "newpass1" });
    expect(login2.status).toBe(200);

    const oldRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(oldRefresh.status).toBe(401);
  });

  it("rejects a wrong current password", async () => {
    const res = await request(app)
      .put("/api/v1/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong", newPassword: "newpass1" });
    expect(res.status).toBe(400);
  });

  it("deletes the account and all its data", async () => {
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Gone Soon" });

    const res = await request(app)
      .delete("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    expect(await Task.countDocuments()).toBe(0);
    expect(await Token.countDocuments()).toBe(0);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "taskuser", password: "taskpass" });
    expect(login.status).toBe(400);
  });
});

describe("RBAC (Admin Routes)", () => {
  const createAdmin = async (
    username = "adminuser",
    email = "admin@example.com"
  ) => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ username, email, password: "adminpass" });
    await User.updateOne({ username }, { role: "admin" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username, password: "adminpass" });
    return login.body.accessToken;
  };

  it("blocks regular users from admin routes", async () => {
    token = await registerAndLogin();
    const res = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient permissions");
  });

  it("lists users with pagination and search", async () => {
    const adminToken = await createAdmin();
    await registerAndLogin("bob", "bob@example.com", "bobpass");
    await registerAndLogin("betty", "betty@example.com", "bettypass");

    const res = await request(app)
      .get("/api/v1/admin/users?search=bob")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(1);
    expect(res.body.users[0].username).toBe("bob");
    expect(res.body.users[0].password).toBeUndefined();
  });

  it("promotes a user to admin", async () => {
    const adminToken = await createAdmin();
    await registerAndLogin("peon", "peon@example.com", "peonpass");
    const user = await User.findOne({ username: "peon" });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("cannot demote yourself", async () => {
    const adminToken = await createAdmin();
    const me = await User.findOne({ username: "adminuser" });
    const res = await request(app)
      .patch(`/api/v1/admin/users/${me._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    expect(res.status).toBe(400);
  });

  it("deletes another user and their data", async () => {
    const adminToken = await createAdmin();
    const bobToken = await registerAndLogin(
      "bob",
      "bob@example.com",
      "bobpass"
    );
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Bob's Task" });
    const bob = await User.findOne({ username: "bob" });

    const res = await request(app)
      .delete(`/api/v1/admin/users/${bob._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);

    expect(await User.findById(bob._id)).toBeNull();
    expect(await Task.countDocuments()).toBe(0);
  });

  it("cannot delete yourself", async () => {
    const adminToken = await createAdmin();
    const me = await User.findOne({ username: "adminuser" });
    const res = await request(app)
      .delete(`/api/v1/admin/users/${me._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("allows admins to list all tasks", async () => {
    const adminToken = await createAdmin();
    token = await registerAndLogin();
    await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Someone's Task" });

    const res = await request(app)
      .get("/api/v1/tasks/all")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.tasks[0].title).toBe("Someone's Task");
  });
});
