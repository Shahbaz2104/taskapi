import type { RequestHandler } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { getClient, isAvailable } from "./redis.js";

const buildLimiter = (options: Options): RequestHandler => {
  const config = { ...options };
  if (isAvailable()) {
    const redis = getClient();
    if (redis) {
      config.store = new RedisStore({
        sendCommand: (...args: string[]) => {
          const [command, ...rest] = args;
          if (!command) {
            return Promise.reject(
              new Error("sendCommand invoked without a command")
            );
          }
          return redis.call(command, rest) as Promise<RedisReply>;
        },
      });
    }
  }
  return rateLimit(config);
};

export { buildLimiter };
