import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const loadEnv = async () => {
  const mod = await import("../../src/config/env.js");
  return mod.env;
};

describe("config/env", () => {
  it("applies documented defaults when optional keys are absent", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("CLIENT_BASE_URL", undefined);
    vi.stubEnv("ACCESS_TOKEN_TTL", undefined);
    vi.stubEnv("REFRESH_TOKEN_TTL", undefined);
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", undefined);
    vi.stubEnv("POSTHOG_HOST", undefined);
    vi.stubEnv("SMTP_PORT", undefined);
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("JWT_SECRET", "secret");

    const env = await loadEnv();

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.CLIENT_BASE_URL).toBe("http://localhost:3000");
    expect(env.ACCESS_TOKEN_TTL).toBe(900);
    expect(env.REFRESH_TOKEN_TTL).toBe(604800);
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(env.POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(env.SMTP_PORT).toBe(587);
  });

  it("coerces numeric env strings into numbers", async () => {
    vi.stubEnv("PORT", "5173");
    vi.stubEnv("ACCESS_TOKEN_TTL", "1800");
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("JWT_SECRET", "secret");

    const env = await loadEnv();

    expect(env.PORT).toBe(5173);
    expect(env.PORT).toBeTypeOf("number");
    expect(env.ACCESS_TOKEN_TTL).toBe(1800);
  });

  it("rejects an unknown NODE_ENV value", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("JWT_SECRET", "secret");

    await expect(loadEnv()).rejects.toThrow();
  });

  it("rejects a non-numeric PORT", async () => {
    vi.stubEnv("PORT", "not-a-port");
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("JWT_SECRET", "secret");

    await expect(loadEnv()).rejects.toThrow();
  });

  it("fails fast when MONGO_URI is missing", async () => {
    vi.stubEnv("MONGO_URI", undefined);
    vi.stubEnv("JWT_SECRET", "secret");

    await expect(loadEnv()).rejects.toThrow();
  });

  it("fails fast when JWT_SECRET is missing", async () => {
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("JWT_SECRET", undefined);

    await expect(loadEnv()).rejects.toThrow();
  });

  it("exposes required core values verbatim when provided", async () => {
    vi.stubEnv("MONGO_URI", "mongodb://db:27017/taskapi");
    vi.stubEnv("JWT_SECRET", "s3cret");

    const env = await loadEnv();

    expect(env.MONGO_URI).toBe("mongodb://db:27017/taskapi");
    expect(env.JWT_SECRET).toBe("s3cret");
  });
});
