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

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
