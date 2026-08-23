jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(),
  })),
}));

process.env.POSTHOG_API_KEY = "phc_test_key";
process.env.POSTHOG_HOST = "https://us.i.posthog.com";

const { PostHog } = require("posthog-node");
const posthog = require("../config/posthog.js");
const analytics = require("../services/analytics.service.js");

describe("PostHog config + analytics service", () => {
  const realNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // initPosthog is disabled under NODE_ENV=test by design; opt out here
    process.env.NODE_ENV = "development";
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
    expect(PostHog).toHaveBeenCalledWith(
      "phc_test_key",
      expect.objectContaining({ host: "https://us.i.posthog.com" })
    );
  });

  it("capture forwards String(distinctId), event, and properties", () => {
    posthog.initPosthog();
    const client = posthog.getClient();

    analytics.capture(12345, "task_created", { priority: "high" });
    expect(client.capture).toHaveBeenCalledWith({
      distinctId: "12345",
      event: "task_created",
      properties: { priority: "high" },
    });
  });

  it("capture swallows client errors instead of throwing", () => {
    posthog.initPosthog();
    const client = posthog.getClient();
    client.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });

    expect(() => analytics.capture("u1", "event")).not.toThrow();
  });

  it("shutdown clears the client", async () => {
    posthog.initPosthog();
    const client = posthog.getClient();
    await posthog.shutdownPosthog();
    expect(client.shutdown).toHaveBeenCalled();
    expect(posthog.isAvailable()).toBe(false);
    expect(posthog.getClient()).toBeNull();
  });
});
