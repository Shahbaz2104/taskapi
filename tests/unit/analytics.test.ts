import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-node", () => ({
  PostHog: class {
    static lastArgs: unknown[] = [];
    capture = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);
    constructor(...args: unknown[]) {
      PostHog.lastArgs = args;
    }
  },
}));

const { PostHog } = await import("posthog-node");
const posthog = await import("../../src/config/posthog.js");
const analytics = await import("../../src/services/analytics.service.js");

describe("PostHog config + analytics service", () => {
  const realNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    ((PostHog as unknown as { lastArgs: unknown[] }).lastArgs = []);
  });

  afterEach(async () => {
    await posthog.shutdownPosthog();
    process.env.NODE_ENV = realNodeEnv;
  });

  it("is unavailable when not initialized", () => {
    expect(posthog.isAvailable()).toBe(false);
    expect(posthog.getClient()).toBeNull();
  });

  it("capture is a safe no-op when disabled", () => {
    expect(() => analytics.capture("u1", "event")).not.toThrow();
  });

  it("initializes a client from env vars", () => {
    posthog.initPosthog();
    expect(posthog.isAvailable()).toBe(true);
    const ctor = PostHog as unknown as { lastArgs: unknown[] };
    expect(ctor.lastArgs[0]).toBe("phc_test_key");
    expect(ctor.lastArgs[1]).toMatchObject({
      host: "https://us.i.posthog.com",
    });
  });

  it("capture forwards String(distinctId), event, and properties", () => {
    posthog.initPosthog();
    const client = posthog.getClient() as unknown as {
      capture: ReturnType<typeof vi.fn>;
    };

    analytics.capture(12345, "task_created", { priority: "high" });
    expect(client.capture).toHaveBeenCalledWith({
      distinctId: "12345",
      event: "task_created",
      properties: { priority: "high" },
    });
  });

  it("capture swallows client errors instead of throwing", () => {
    posthog.initPosthog();
    const client = posthog.getClient() as unknown as {
      capture: ReturnType<typeof vi.fn>;
    };
    client.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });

    expect(() => analytics.capture("u1", "event")).not.toThrow();
  });

  it("shutdown clears the client", async () => {
    posthog.initPosthog();
    const client = posthog.getClient() as unknown as {
      shutdown: ReturnType<typeof vi.fn>;
    };
    await posthog.shutdownPosthog();
    expect(client.shutdown).toHaveBeenCalled();
    expect(posthog.isAvailable()).toBe(false);
    expect(posthog.getClient()).toBeNull();
  });
});
