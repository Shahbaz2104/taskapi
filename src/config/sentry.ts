import type { Express } from "express";
import * as Sentry from "@sentry/node";
import logger from "./logger.js";
import { env } from "./env.js";

const isEnabled = (): boolean => !!env.SENTRY_DSN && env.NODE_ENV !== "test";

const initSentry = (): boolean => {
  if (!isEnabled()) return false;
  try {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      integrations: [Sentry.expressIntegration()],
    });
    logger.info("Sentry error tracking enabled");
    return true;
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Sentry");
    return false;
  }
};

const reportError = (
  err: unknown,
  context: Record<string, unknown> = {}
): void => {
  if (!isEnabled()) return;
  try {
    Sentry.captureException(err, { extra: context });
  } catch {
    // swallow
  }
};

const attachSentryErrorHandler = (app: Express): void => {
  if (!isEnabled() || typeof Sentry.setupExpressErrorHandler !== "function")
    return;
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    logger.warn({ err }, "Failed to attach Sentry error handler");
  }
};

const closeSentry = async (): Promise<void> => {
  if (!isEnabled()) return;
  try {
    await Sentry.close(2000);
  } catch {
    // swallow
  }
};

export { initSentry, reportError, attachSentryErrorHandler, closeSentry };
