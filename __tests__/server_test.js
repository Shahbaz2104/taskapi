jest.setTimeout(30000);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");

let mongoServer;
let app;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  app = require("../index.js");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Server boot", () => {
  it("returns OK from /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });

  it("reports DB connectivity from /ready", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("connected");
  });

  it("exposes prometheus metrics at /metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("process_cpu_seconds_total");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Route not found");
  });

  it("serves Swagger docs at /api-docs", async () => {
    const res = await request(app).get("/api-docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Swagger UI");
  });

  it("serves the full API under /api/v1", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "bootuser",
      email: "boot@example.com",
      password: "bootpass",
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
  });
});
