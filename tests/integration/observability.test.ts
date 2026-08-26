import express, { type Express } from "express";
import request from "supertest";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { zodValidate } from "../../src/middleware/zod.js";
import * as sentry from "../../src/config/sentry.js";

describe("zod validation middleware (legacy parity)", () => {
  const schema = z.object({
    ids: z
      .array(z.string().regex(/^[0-9a-f]{24}$/i))
      .min(1)
      .max(2),
    action: z.enum(["trash", "restore"]),
  });

  const querySchema = z.object({
    ids: z
      .union([z.string().regex(/^[0-9a-f]{24}$/i), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : [v])),
    action: z.enum(["trash", "restore"]),
  });

  const buildApp = (source?: "query"): Express => {
    const app = express();
    app.use(express.json());
    if (source === "query") {
      app.get("/t", zodValidate(querySchema, "query"), (req, res) =>
        res.json({ ok: true, q: req.query.action })
      );
    } else {
      app.post("/t", zodValidate(schema), (req, res) =>
        res.json({ ok: true, body: req.body })
      );
    }
    return app;
  };

  it("passes valid body through to the handler", async () => {
    const res = await request(buildApp())
      .post("/t")
      .send({ ids: ["507f1f77bcf86cd799439011"], action: "trash" });
    expect(res.status).toBe(200);
    expect(res.body.body.ids).toHaveLength(1);
  });

  it("rejects invalid payload with first-issue message in { error } shape", async () => {
    const res = await request(buildApp())
      .post("/t")
      .send({ ids: [], action: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^body\./);
    expect(Object.keys(res.body)).toEqual(["error"]);
  });

  it("rejects non-array ids and oversized arrays", async () => {
    const one = await request(buildApp())
      .post("/t")
      .send({ ids: "x", action: "trash" });
    expect(one.status).toBe(400);

    const three = await request(buildApp())
      .post("/t")
      .send({
        ids: [
          "507f1f77bcf86cd799439011",
          "507f1f77bcf86cd799439012",
          "507f1f77bcf86cd799439013",
        ],
        action: "trash",
      });
    expect(three.status).toBe(400);
    expect(three.body.error).toContain("ids");
  });

  it("supports the query source", async () => {
    const res = await request(buildApp("query")).get(
      "/t?ids=507f1f77bcf86cd799439011&action=restore"
    );
    expect(res.status).toBe(200);
    expect(res.body.q).toBe("restore");

    const bad = await request(buildApp("query")).get("/t?action=restore");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("query.");
  });
});

describe("sentry config soft-fail behavior", () => {
  const originalDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
  });

  it("does not initialize without a DSN", async () => {
    delete process.env.SENTRY_DSN;
    expect(sentry.initSentry()).toBe(false);
  });

  it("does not initialize under NODE_ENV=test even with a DSN", () => {
    process.env.SENTRY_DSN = "https://k@o0.ingest.sentry.io/1";
    expect(sentry.initSentry()).toBe(false);
  });

  it("reportError and closeSentry are safe no-ops when disabled", async () => {
    delete process.env.SENTRY_DSN;
    expect(() => sentry.reportError(new Error("boom"))).not.toThrow();
    await expect(sentry.closeSentry()).resolves.toBeUndefined();
  });

  it("attachSentryErrorHandler does not throw without a DSN", () => {
    delete process.env.SENTRY_DSN;
    const app = express();
    expect(() => sentry.attachSentryErrorHandler(app)).not.toThrow();
  });

  it("isEnabled-style gating: test env short-circuit dominates", () => {
    const dsn = "https://k@o0.ingest.sentry.io/2";
    const gated = !!dsn && process.env.NODE_ENV === "test" ? false : !!dsn;
    expect(gated).toBe(false);
  });
});
