// Sentry error tracking — soft-fail like config/redis.js and
// config/posthog.js: inert without SENTRY_DSN or under NODE_ENV=test.
// Express route errors are captured by setupExpressErrorHandler (see
// attachSentryErrorHandler in index.js); non-HTTP failure paths such as
// queue workers use reportError() directly.

const Sentry = require("@sentry/node");
const logger = require("./logger");

const isEnabled = () =>
  !!process.env.SENTRY_DSN && process.env.NODE_ENV !== "test";

const initSentry = () => {
  if (!isEnabled()) return false;
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      integrations: [Sentry.expressIntegration()],
    });
    logger.info("Sentry error tracking enabled");
    return true;
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Sentry");
    return false;
  }
};

// Seam for non-Express failure paths — never throws so observability can
// never break a job or boot sequence.
const reportError = (err, context = {}) => {
  if (!isEnabled()) return;
  try {
    Sentry.captureException(err, { extra: context });
  } catch {
    // swallow
  }
};

// Must be registered after all routes but before the app's own error
// handler; captures and forwards errors down the chain.
const attachSentryErrorHandler = (app) => {
  if (!isEnabled() || typeof Sentry.setupExpressErrorHandler !== "function")
    return;
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    logger.warn({ err }, "Failed to attach Sentry error handler");
  }
};

const closeSentry = async () => {
  if (!isEnabled()) return;
  try {
    await Sentry.close(2000);
  } catch {
    // swallow
  }
};

module.exports = {
  initSentry,
  reportError,
  attachSentryErrorHandler,
  closeSentry,
};
