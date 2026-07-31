jest.setTimeout(30000);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");

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

describe("Auth Routes", () => {
  it("registers a new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "testuser", password: "testpass" });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("User created");
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
    const res = await request(app)
      .post("/auth/register")
      .send({});
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
    await request(app)
      .post("/auth/register")
      .send({ username: "taskuser", password: "taskpass" });
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ username: "taskuser", password: "taskpass" });
    token = loginRes.body.token;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(401);
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

  it("gets all tasks for the user", async () => {
    await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task 1" });
    const res = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
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

    await request(app)
      .post("/auth/register")
      .send({ username: "otheruser", password: "otherpass" });
    const otherLogin = await request(app)
      .post("/auth/login")
      .send({ username: "otheruser", password: "otherpass" });
    const otherToken = otherLogin.body.token;

    const res = await request(app)
      .get(`/tasks/${createRes.body._id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});
