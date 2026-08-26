import { PostHog } from "posthog-node";
import logger from "./logger.js";
import { env } from "./env.js";

let client: PostHog | null = null;

const initPosthog = (): void => {
  if (!env.POSTHOG_API_KEY || env.NODE_ENV === "test") return;

  client = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10_000,
  });
  logger.info("PostHog analytics enabled");
};

const shutdownPosthog = async (): Promise<void> => {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    logger.warn({ err }, "Failed to shut down PostHog cleanly");
  }
  client = null;
};

const isAvailable = (): boolean => !!client;

const getClient = (): PostHog | null => client;

export { initPosthog, shutdownPosthog, isAvailable, getClient };
