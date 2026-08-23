jest.setTimeout(30000);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const express = require("express");

let mongoServer;
let app;
let token;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  const authRoutes = require("../routes/auth_routes");
  const userRoutes = require("../routes/user_routes");
  const errorHandler = require("../middleware/error_handler");

  app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  token = undefined;
});

const login = async (username = "hookuser") => {
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

const auth = () => ({ Authorization: `Bearer ${token}` });

const createHook = (overrides = {}) =>
  request(app)
    .post("/api/v1/me/webhooks")
    .set(auth())
    .send({
      url: "https://hooks.example.com/endpoint",
      events: ["task.created"],
      ...overrides,
    });

describe("webhook CRUD", () => {
  it("creates a webhook with a generated secret and lists it back", async () => {
    await login();
    const created = await createHook();

    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(created.body.active).toBe(true);
    expect(created.body.consecutiveFailures).toBe(0);

    const list = await request(app).get("/api/v1/me/webhooks").set(auth());
    expect(list.body.webhooks).toHaveLength(1);
    expect(list.body.webhooks[0].url).toBe(
      "https://hooks.example.com/endpoint"
    );
  });

  it("validates payloads via zod — bad url, empty events, unknown event", async () => {
    await login();

    const badUrl = await createHook({ url: "not-a-url" });
    expect(badUrl.status).toBe(400);
    expect(badUrl.body.error).toContain("body.url");

    const noEvents = await createHook({ events: [] });
    expect(noEvents.status).toBe(400);

    const unknownEvent = await createHook({ events: ["task.exploded"] });
    expect(unknownEvent.status).toBe(400);

    const missingBody = await request(app)
      .post("/api/v1/me/webhooks")
      .set(auth())
      .send({});
    expect(missingBody.status).toBe(400);
  });

  it("updates url/events/active and rejects foreign or unknown ids with 404", async () => {
    await login();
    const hook = (await createHook()).body;

    const updated = await request(app)
      .patch(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth())
      .send({ active: false, events: ["task.completed"] });
    expect(updated.status).toBe(200);
    expect(updated.body.active).toBe(false);
    expect(updated.body.events).toEqual(["task.completed"]);

    const updateEmpty = await request(app)
      .patch(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth())
      .send({});
    expect(updateEmpty.status).toBe(400);

    const missing = await request(app)
      .patch(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth())
      .send({ active: true });
    // still ours — fine
    expect(missing.status).toBe(200);

    const bogusId = await request(app)
      .delete("/api/v1/me/webhooks/507f1f77bcf86cd799439011")
      .set(auth());
    expect(bogusId.status).toBe(404);
  });

  it("deletes a webhook; another user cannot see or delete it", async () => {
    await login("owner1");
    const hook = (await createHook()).body;

    await login("stranger1");
    const strangerList = await request(app)
      .get("/api/v1/me/webhooks")
      .set(auth());
    expect(strangerList.body.webhooks).toHaveLength(0);

    const foreignDelete = await request(app)
      .delete(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth());
    expect(foreignDelete.status).toBe(404);

    await login("owner1");
    const del = await request(app)
      .delete(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth());
    expect(del.status).toBe(204);

    const after = await request(app).get("/api/v1/me/webhooks").set(auth());
    expect(after.body.webhooks).toHaveLength(0);
  });

  it("ping returns 202 even without the queue backend", async () => {
    await login();
    const hook = (await createHook()).body;
    const ping = await request(app)
      .post(`/api/v1/me/webhooks/${hook._id}/ping`)
      .set(auth());
    expect(ping.status).toBe(202);
    expect(ping.body.queued).toBe(false); // Redis disabled under NODE_ENV=test

    const bogusPing = await request(app)
      .post("/api/v1/me/webhooks/507f1f77bcf86cd799439011/ping")
      .set(auth());
    expect(bogusPing.status).toBe(404);
  });
});

describe("signed delivery + circuit breaker", () => {
  const crypto = require("crypto");

  const makeJobData = (hook, event = "test.ping") => ({
    webhookId: hook._id,
    url: hook.url,
    secret: hook.secret,
    event,
    rawBody: JSON.stringify({ id: "d2", event }),
  });

  it("sends HMAC-signed POST and records success", async () => {
    const { performDelivery } = require("../jobs/webhooks_worker.js");

    await login();
    const hook = (await createHook()).body;
    const data = makeJobData(hook);

    let captured;
    global.fetch = jest.fn(async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200 };
    });

    const result = await performDelivery(data);

    expect(result.ok).toBe(true);
    expect(captured.url).toBe(hook.url);
    expect(captured.opts.method).toBe("POST");
    expect(captured.opts.headers["X-TaskAPI-Event"]).toBe("test.ping");
    expect(JSON.parse(captured.opts.body)).toEqual(JSON.parse(data.rawBody));

    const timestamp = captured.opts.headers["X-TaskAPI-Timestamp"];
    const expectedSig =
      "sha256=" +
      crypto
        .createHmac("sha256", hook.secret)
        .update(`${timestamp}.${data.rawBody}`)
        .digest("hex");
    expect(captured.opts.headers["X-TaskAPI-Signature"]).toBe(expectedSig);

    const updated = await mongoose
      .model("Webhook")
      .findById(hook._id)
      .select("consecutiveFailures");
    expect(updated.consecutiveFailures).toBe(0);
  });

  it("treats HTTP error responses as failed deliveries", async () => {
    const { performDelivery } = require("../jobs/webhooks_worker.js");

    await login("httpfail");
    const hook = (await createHook()).body;

    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));

    await expect(performDelivery(makeJobData(hook))).rejects.toThrow(
      "responded 500"
    );
    const updated = await mongoose
      .model("Webhook")
      .findById(hook._id)
      .select("consecutiveFailures");
    expect(updated.consecutiveFailures).toBe(1);
  });

  it("auto-deactivates after WEBHOOK_MAX_CONSECUTIVE_FAILURES consecutive failures", async () => {
    const { performDelivery } = require("../jobs/webhooks_worker.js");
    const { WEBHOOK_MAX_CONSECUTIVE_FAILURES } = require("../config/constants");

    await login("breaker");
    const hook = (await createHook({ events: ["task.completed"] })).body;
    const data = makeJobData(hook, "task.completed");

    global.fetch = jest.fn(async () => {
      throw new Error("connection refused");
    });

    for (let i = 0; i < WEBHOOK_MAX_CONSECUTIVE_FAILURES; i++) {
      await expect(performDelivery(data)).rejects.toThrow();
    }

    const updated = await mongoose
      .model("Webhook")
      .findById(hook._id)
      .select("active consecutiveFailures");
    expect(updated.active).toBe(false);
    expect(updated.consecutiveFailures).toBe(WEBHOOK_MAX_CONSECUTIVE_FAILURES);

    // Re-arming resets the counter
    await request(app)
      .patch(`/api/v1/me/webhooks/${hook._id}`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ active: true });
    const rearmed = await mongoose
      .model("Webhook")
      .findById(hook._id)
      .select("consecutiveFailures");
    expect(rearmed.consecutiveFailures).toBe(0);
  });
});
