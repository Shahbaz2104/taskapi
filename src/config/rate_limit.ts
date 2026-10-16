import type { RequestHandler } from "express";
import rateLimitModule, { type Options } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";

// express-rate-limit ships dual ESM/CJS typings; some resolvers surface the
// default import as the package namespace (not callable) — unwrap it.
const rateLimit =
  (
    rateLimitModule as unknown as {
      default?: (options?: Partial<Options>) => RequestHandler;
    }
  ).default ??
  (rateLimitModule as unknown as (
    options?: Partial<Options>
  ) => RequestHandler);
import { getClient, isAvailable } from "./redis.js";

const buildLimiter = (options: Partial<Options>): RequestHandler => {
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
