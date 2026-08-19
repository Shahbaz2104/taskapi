const errorHandler = require("../middleware/error_handler.js");
const { authorize } = require("../middleware/rbac.js");
const tasksService = require("../services/tasks.service.js");

const fakeRes = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.body = data;
    return this;
  },
});

describe("error_handler", () => {
  it("returns a generic message for server errors", () => {
    const res = fakeRes();
    errorHandler(new Error("leaky internals"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.error).not.toBe("leaky internals");
  });

  it("passes through messages for 4xx errors", () => {
    const res = fakeRes();
    const err = Object.assign(new Error("Task not found"), { status: 404 });
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Task not found");
  });

  it("defaults unknown errors to 500", () => {
    const res = fakeRes();
    errorHandler(new Error("boom"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
  });
});

describe("rbac authorize", () => {
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  it("allows a matching role", () => {
    const res = fakeRes();
    authorize("admin")({ user: { role: "admin" } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it("denies a non-matching role with 403", () => {
    const res = fakeRes();
    authorize("admin")({ user: { role: "user" } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("Insufficient permissions");
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts multiple roles", () => {
    const res = fakeRes();
    authorize("admin", "user")({ user: { role: "user" } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("tasksService helpers", () => {
  it("advances daily recurrence by one day", () => {
    const next = tasksService.nextDueDate(
      new Date("2026-06-01T00:00:00Z"),
      "daily"
    );
    expect(next.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("advances weekly recurrence by seven days", () => {
    const next = tasksService.nextDueDate(
      new Date("2026-06-01T00:00:00Z"),
      "weekly"
    );
    expect(next.toISOString()).toBe("2026-06-08T00:00:00.000Z");
  });

  it("advances monthly recurrence by one month", () => {
    const next = tasksService.nextDueDate(
      new Date("2026-06-01T00:00:00Z"),
      "monthly"
    );
    expect(next.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses now when no base due date exists", () => {
    const before = Date.now();
    const next = tasksService.nextDueDate(null, "daily");
    expect(next.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("parses valid sort specifiers", () => {
    expect(tasksService.parseSort("dueDate")).toEqual({
      field: "dueDate",
      direction: 1,
    });
    expect(tasksService.parseSort("-createdAt")).toEqual({
      field: "createdAt",
      direction: -1,
    });
    expect(tasksService.parseSort("priority")).toEqual({
      field: "priority",
      direction: 1,
    });
  });

  it("rejects invalid sort specifiers", () => {
    expect(tasksService.parseSort("bogus")).toBeNull();
    expect(tasksService.parseSort("")).toBeNull();
    expect(tasksService.parseSort(undefined)).toBeNull();
  });
});
