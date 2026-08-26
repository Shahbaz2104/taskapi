import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  REDIS_URL: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  CLIENT_BASE_URL: z.string().default("http://localhost:3000"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  LOG_LEVEL: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;

const STRING_KEYS = new Set([
  "NODE_ENV",
  "MONGO_URI",
  "JWT_SECRET",
  "REDIS_URL",
  "CORS_ORIGIN",
  "CLIENT_BASE_URL",
  "LOG_LEVEL",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "SENTRY_DSN",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
]);

// Live view: string keys re-read process.env so runtime changes (and
// test harnesses) behave exactly like the legacy lazy reads, while
// numeric coercion and documented defaults still come from the schema.
export const env: Env = new Proxy(parsed, {
  get(target, prop) {
    if (typeof prop === "string" && STRING_KEYS.has(prop)) {
      const live = process.env[prop];
      if (live !== undefined) return live;
    }
    return target[prop as keyof Env];
  },
});
