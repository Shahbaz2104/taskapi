import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { Types } from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AuthenticationError, ConflictError } from "../../src/errors/index.js";
import { errorHandler } from "../../src/middleware/error_handler.js";
import { authorize } from "../../src/middleware/rbac.js";
import { zodValidate } from "../../src/middleware/zod.js";
import type { RequestUser } from "../../src/types/auth.js";

type AnyHandler = (req: Request, res: Response, next: NextFunction) => void;

const h =
  (fn: (req: Request, res: Response) => void): RequestHandler =>
  (req, res) => {
    fn(req, res);
  };

const buildApp = (...chain: AnyHandler[]): express.Express => {
  const app = express();
  app.use(express.json());
  app.post("/", ...(chain as RequestHandler[]));
  return app;
};

const throwerApp = (throwFn: () => never): express.Express =>
  buildApp(
    (_req, _res, next) => {
      try {
        throw throwFn();
      } catch (err) {
        next(err);
      }
    },
    errorHandler as unknown as AnyHandler
  );

const uid = "65f1b2c3d4e5f6a7b8c9d0e1" as unknown as Types.ObjectId;

const asUser =
  (user: RequestUser): AnyHandler =>
  (req, _res, next) => {
    req.user = user;
    next();
  };

describe("middleware/error_handler", () => {
  it("passes 4xx AppError status and message through", async () => {
    const res = await request(
      throwerApp(() => {
        throw new ConflictError("Idempotent request in progress");
      })
    )
      .post("/")
      .send();

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Idempotent request in progress" });
  });

  it("masks messages for status >= 500", async () => {
    const res = await request(
      throwerApp(() => {
        throw new Error("db password is hunter2");
      })
    )
      .post("/")
      .send();

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  it("keeps auth errors intact", async () => {
    const res = await request(
      throwerApp(() => {
        throw new AuthenticationError("Token expired, please log in again");
      })
    )
      .post("/")
      .send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Token expired, please log in again");
  });

  it("treats unknown thrown values as 500", async () => {
    const res = await request(
      throwerApp(() => {
        throw "just a string";
      })
    )
      .post("/")
      .send();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});

describe("middleware/zod", () => {
  const schema = z.object({ n: z.coerce.number().int() });

  it("assigns the parsed (coerced) value back onto req.body", async () => {
    let seen: unknown;
    const app = buildApp(
      zodValidate(schema),
      h((req, res) => {
        seen = req.body;
        res.json({ ok: true });
      })
    );

    const res = await request(app).post("/").send({ n: "5" });

    expect(res.status).toBe(200);
    expect(seen).toEqual({ n: 5 });
    expect((seen as { n: number }).n).toBeTypeOf("number");
  });

  it("answers 400 with the body.<path> label on failure", async () => {
    const app = buildApp(zodValidate(schema));

    const res = await request(app).post("/").send({ n: "nope" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^body\.n:/);
  });

  it("labels query-source failures with the query prefix", async () => {
    const app = buildApp(
      zodValidate(z.object({ mode: z.enum(["open", "done"]) }), "query")
    );

    const res = await request(app).post("/").query({ mode: "archived" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^query\.mode:/);
  });

  it("accepts valid query input without mutation", async () => {
    let called = false;
    const app = buildApp(
      zodValidate(z.object({ id: z.string() }), "query"),
      h((_req, res) => {
        called = true;
        res.json({ ok: true });
      })
    );

    const res = await request(app).post("/").query({ id: "abc" });

    expect(res.status).toBe(200);
    expect(called).toBe(true);
  });
});

describe("middleware/rbac", () => {
  it("allows listed roles through", async () => {
    const app = buildApp(
      asUser({ userId: uid, role: "admin" }),
      authorize("admin"),
      h((_req, res) => {
        res.json({ ok: true });
      })
    );

    const res = await request(app).post("/").send();
    expect(res.status).toBe(200);
  });

  it("rejects unlisted roles with 403", async () => {
    const app = buildApp(
      asUser({ userId: uid, role: "user" }),
      authorize("admin"),
      h((_req, res) => {
        res.json({ ok: true });
      })
    );

    const res = await request(app).post("/").send();
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Insufficient permissions" });
  });

  it("rejects when protect was skipped (no req.user)", async () => {
    const app = buildApp(
      authorize("admin"),
      h((_req, res) => {
        res.json({ ok: true });
      })
    );

    const res = await request(app).post("/").send();
    expect(res.status).toBe(403);
  });
});
