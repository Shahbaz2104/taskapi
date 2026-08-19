const Redis = require("ioredis");
const logger = require("./logger");

let client = null;
let available = false;

const initRedis = async () => {
  if (!process.env.REDIS_URL || process.env.NODE_ENV === "test") return null;

  client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  client.on("error", (err) => logger.warn({ err }, "Redis connection error"));

  try {
    await client.connect();
    await client.ping();
    available = true;
    logger.info("Redis connected");
  } catch {
    available = false;
    try {
      client.disconnect();
    } catch (e) {
      logger.warn({ err: e }, "Failed to disconnect Redis client");
    }
    logger.warn("Redis unavailable — falling back to in-memory stores");
  }

  return available ? client : null;
};

const closeRedis = async () => {
  if (client) {
    try {
      await client.quit();
    } catch (e) {
      logger.warn({ err: e }, "Failed to close Redis client");
    }
  }
};

const isAvailable = () => available;

const getClient = () => (available ? client : null);

module.exports = { initRedis, closeRedis, isAvailable, getClient };
