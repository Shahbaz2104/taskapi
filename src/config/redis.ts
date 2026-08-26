import Redis from "ioredis";
import logger from "./logger.js";
import { env } from "./env.js";

let client: Redis | null = null;
let available = false;

const initRedis = async (): Promise<Redis | null> => {
  if (!env.REDIS_URL || env.NODE_ENV === "test") return null;

  const next = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  next.on("error", (err) => logger.warn({ err }, "Redis connection error"));

  try {
    await next.connect();
    await next.ping();
    client = next;
    available = true;
    logger.info("Redis connected");
  } catch {
    available = false;
    try {
      next.disconnect();
    } catch (e) {
      logger.warn({ err: e }, "Failed to disconnect Redis client");
    }
    logger.warn("Redis unavailable — falling back to in-memory stores");
  }

  return available ? client : null;
};

const closeRedis = async (): Promise<void> => {
  if (client) {
    try {
      await client.quit();
    } catch (e) {
      logger.warn({ err: e }, "Failed to close Redis client");
    }
  }
};

const isAvailable = (): boolean => available;

const getClient = (): Redis | null => (available ? client : null);

export { initRedis, closeRedis, isAvailable, getClient };
