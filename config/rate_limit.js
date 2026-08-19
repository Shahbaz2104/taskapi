const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { isAvailable, getClient } = require("./redis");

// Builds a rate limiter backed by Redis when available (shared across
// instances), falling back to the in-memory store otherwise.
const buildLimiter = (options) => {
  const config = { ...options };
  if (isAvailable()) {
    config.store = new RedisStore({
      sendCommand: (...args) => getClient().call(...args),
    });
  }
  return rateLimit(config);
};

module.exports = { buildLimiter };
