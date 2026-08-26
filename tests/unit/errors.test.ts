import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  isAppError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../../src/errors/index.js";

describe("errors", () => {
  it("maps each domain error to its HTTP status", () => {
    expect(new ValidationError("bad input").status).toBe(400);
    expect(new AuthenticationError().status).toBe(401);
    expect(new AuthorizationError().status).toBe(403);
    expect(new NotFoundError("Task not found").status).toBe(404);
    expect(new ConflictError("Idempotent request in progress").status).toBe(
      409
    );
    expect(new RateLimitError().status).toBe(429);
    expect(new DatabaseError().status).toBe(500);
    expect(new ExternalServiceError("SMTP unavailable").status).toBe(502);
  });

  it("derives error names from the concrete subclass", () => {
    const err = new NotFoundError("Session not found");
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe("Session not found");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it("isAppError discriminates app errors from unknown throws", () => {
    expect(isAppError(new ConflictError())).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string throw")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
