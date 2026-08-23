// PostHog product-analytics client — soft-fail like config/redis.js:
// inert without POSTHOG_API_KEY or under NODE_ENV=test; capture errors
// are swallowed so analytics can never break a request path.

const { PostHog } = require("posthog-node");
const logger = require("./logger");

let client = null;

const initPosthog = () => {
  if (!process.env.POSTHOG_API_KEY || process.env.NODE_ENV === "test") return;

  client = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 20,
    flushInterval: 10_000,
  });
  logger.info("PostHog analytics enabled");
};

const shutdownPosthog = async () => {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    logger.warn({ err }, "Failed to shut down PostHog cleanly");
  }
  client = null;
};

const isAvailable = () => !!client;

const getClient = () => client;

module.exports = { initPosthog, shutdownPosthog, isAvailable, getClient };
