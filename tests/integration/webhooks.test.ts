import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

let mongoServer: MongoMemoryServer;
let app: express.Express;
let token: string | undefined;

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

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
  token = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const login = async (username = "hookuser"): Promise<void> => {
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

interface HookBody {
  _id: string;
  secret: string;
  url: string;
  active?: boolean;
  consecutiveFailures?: number;
}

const createHook = (overrides: Record<string, unknown> = {}): request.Test =>
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
    const hook = (await createHook()).body as HookBody;

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

    const stillOurs = await request(app)
      .patch(`/api/v1/me/webhooks/${hook._id}`)
      .set(auth())
      .send({ active: true });
    expect(stillOurs.status).toBe(200);

    const bogusId = await request(app)
      .delete("/api/v1/me/webhooks/507f1f77bcf86cd799439011")
      .set(auth());
    expect(bogusId.status).toBe(404);
  });

  it("deletes a webhook; another user cannot see or delete it", async () => {
    await login("owner1");
    const hook = (await createHook()).body as HookBody;

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
    const hook = (await createHook()).body as HookBody;
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
  const makeJobData = (
    hook: HookBody,
    event = "test.ping"
  ): {
    webhookId: string;
    url: string;
    secret: string;
    event: string;
    rawBody: string;
  } => ({
    webhookId: hook._id,
    url: hook.url,
    secret: hook.secret,
    event,
    rawBody: JSON.stringify({ id: "d2", event }),
  });

  it("sends HMAC-signed POST and records success", async () => {
    const { performDelivery } =
      await import("../../src/jobs/webhooks.worker.js");
    const { Webhook } = await import("../../src/models/webhook.js");

    await login();
    const hook = (await createHook()).body as HookBody;
    const data = makeJobData(hook);

    let captured: { url: string; opts: RequestInit } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts: RequestInit) => {
        captured = { url, opts };
        return { ok: true, status: 200 };
      })
    );

    const result = await performDelivery(data);

    expect(result.ok).toBe(true);
    expect(captured?.url).toBe(hook.url);
    const headers = captured?.opts.headers as Record<string, string>;
    expect(captured?.opts.method).toBe("POST");
    expect(headers["X-TaskAPI-Event"]).toBe("test.ping");
    expect(JSON.parse(String(captured?.opts.body))).toEqual(
      JSON.parse(data.rawBody)
    );

    const timestamp = headers["X-TaskAPI-Timestamp"];
    const expectedSig =
      "sha256=" +
      crypto
        .createHmac("sha256", hook.secret)
        .update(`${timestamp}.${data.rawBody}`)
        .digest("hex");
    expect(headers["X-TaskAPI-Signature"]).toBe(expectedSig);

    const updated = await Webhook.findById(hook._id).select(
      "consecutiveFailures"
    );
    expect(updated?.consecutiveFailures).toBe(0);
  });

  it("treats HTTP error responses as failed deliveries", async () => {
    const { performDelivery } =
      await import("../../src/jobs/webhooks.worker.js");
    const { Webhook } = await import("../../src/models/webhook.js");

    await login("httpfail");
    const hook = (await createHook()).body as HookBody;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }))
    );

    await expect(performDelivery(makeJobData(hook))).rejects.toThrow(
      "responded 500"
    );
    const updated = await Webhook.findById(hook._id).select(
      "consecutiveFailures"
    );
    expect(updated?.consecutiveFailures).toBe(1);
  });

  it("auto-deactivates after WEBHOOK_MAX_CONSECUTIVE_FAILURES consecutive failures", async () => {
    const { performDelivery } =
      await import("../../src/jobs/webhooks.worker.js");
    const { WEBHOOK_MAX_CONSECUTIVE_FAILURES } =
      await import("../../src/config/constants.js");
    const { Webhook } = await import("../../src/models/webhook.js");

    await login("breaker");
    const created = (await createHook({ events: ["task.completed"] }))
      .body as HookBody;
    const data = makeJobData(created, "task.completed");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      })
    );

    for (let i = 0; i < WEBHOOK_MAX_CONSECUTIVE_FAILURES; i++) {
      await expect(performDelivery(data)).rejects.toThrow();
    }

    const updated = await Webhook.findById(created._id).select(
      "active consecutiveFailures"
    );
    expect(updated?.active).toBe(false);
    expect(updated?.consecutiveFailures).toBe(WEBHOOK_MAX_CONSECUTIVE_FAILURES);

    // Re-arming resets the counter
    await request(app)
      .patch(`/api/v1/me/webhooks/${created._id}`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ active: true });
    const rearmed = await Webhook.findById(created._id).select(
      "consecutiveFailures"
    );
    expect(rearmed?.consecutiveFailures).toBe(0);
  });
});
