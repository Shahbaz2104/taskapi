import pino from "pino";
import { env } from "./env.js";

const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
  redact: ["req.headers.authorization"],
});

export default logger;
