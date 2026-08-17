jest.setTimeout(30000);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");

const User = require("../models/users_models.js");

let mongoServer;
let app;
let token;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  const tasksRoutes = require("../routes/tasks_routes");
  const authRoutes = require("../routes/auth_routes");

  app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  app.use("/tasks", tasksRoutes);
  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
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
  password = "taskpass"
) => {
  await request(app).post("/auth/register").send({ username, password });
  const loginRes = await request(app)
    .post("/auth/login")
    .send({ username, password });
  return loginRes.body.token;
};

describe("Auth Routes", () => {
  it("registers a new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "testuser", password: "testpass" });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("User created");
    expect(res.body.token).toBeDefined();
  });

  it("rejects duplicate registration", async () => {
    await request(app)
      .post("/auth/register")
      .send({ username: "dupuser", password: "testpass" });
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "dupuser", password: "testpass" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("User exists");
  });

  it("rejects missing fields on register", async () => {
    const res = await request(app).post("/auth/register").send({});
    expect(res.status).toBe(400);
  });

  it("rejects a weak password on register", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "weakpass", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Password/);
  });

  it("rejects a short username on register", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "ab", password: "validpass" });
    expect(res.status).toBe(400);
  });

  it("logs in and returns a token", async () => {
    await request(app)
      .post("/auth/register")
      .send({ username: "loginuser", password: "loginpass" });
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "loginuser", password: "loginpass" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "nobody", password: "wrong" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid credentials");
  });
});

describe("Tasks Routes", () => {
  beforeEach(async () => {
    token = await registerAndLogin();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app)
      .get("/tasks")
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
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Test Task", description: "Test description" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Test Task");
  });

  it("rejects task without title", async () => {
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects a task with an over-long title", async () => {
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("gets all tasks for the user", async () => {
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task 1" });
    const res = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it("paginates tasks", async () => {
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post("/tasks")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: `Task ${i}` });
    }
    const res = await request(app)
      .get("/tasks?page=2&limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(2);
  });

  it("filters tasks by status", async () => {
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Pending Task" });
    const done = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Done Task" });
    await request(app)
      .put(`/tasks/${done.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    const res = await request(app)
      .get("/tasks?status=completed")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBe(1);
    expect(res.body.tasks[0].title).toBe("Done Task");
  });

  it("rejects an invalid status filter", async () => {
    const res = await request(app)
      .get("/tasks?status=bogus")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Status must be pending or completed");
  });

  it("gets a task by id", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Task" });
    const res = await request(app)
      .get(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("My Task");
  });

  it("rejects a malformed task id", async () => {
    const res = await request(app)
      .get("/tasks/not-a-valid-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid task ID");
  });

  it("updates a task", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Old Title" });
    const res = await request(app)
      .put(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New Title");
  });

  it("rejects an empty update body", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("At least one field to update is required");
  });

  it("rejects an update body with only disallowed fields", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ user: "65f1b2c3d4e5f6a7b8c9d0e1" });
    expect(res.status).toBe(400);
  });

  it("does not allow reassigning a task to another user", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Task" });
    const res = await request(app)
      .put(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New Title", user: "65f1b2c3d4e5f6a7b8c9d0e1" });
    expect(res.status).toBe(200);
    expect(res.body.user).not.toBe("65f1b2c3d4e5f6a7b8c9d0e1");
  });

  it("rejects an invalid status on update", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task" });
    const res = await request(app)
      .put(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "bogus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Status must be pending or completed");
  });

  it("deletes a task", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To Delete" });
    const res = await request(app)
      .delete(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it("does not allow access to another user's task", async () => {
    const createRes = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "My Private Task" });

    const otherToken = await registerAndLogin("otheruser", "otherpass");

    const res = await request(app)
      .get(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe("RBAC (Admin Routes)", () => {
  it("blocks regular users from the admin route", async () => {
    token = await registerAndLogin();
    const res = await request(app)
      .get("/tasks/all")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient permissions");
  });

  it("allows admins to list all tasks", async () => {
    // Register a normal user and promote them to admin directly
    await request(app)
      .post("/auth/register")
      .send({ username: "adminuser", password: "adminpass" });
    await User.updateOne({ username: "adminuser" }, { role: "admin" });

    const adminLogin = await request(app)
      .post("/auth/login")
      .send({ username: "adminuser", password: "adminpass" });
    const adminToken = adminLogin.body.token;

    // Create a task as a regular user
    token = await registerAndLogin();
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Someone's Task" });

    const res = await request(app)
      .get("/tasks/all")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("Someone's Task");
  });
});
