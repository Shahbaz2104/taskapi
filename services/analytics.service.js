// Single analytics seam — everything product-event-shaped goes through
// here so call sites stay thin and the fan-out point (webhooks land here
// in a later phase) lives in exactly one module.

const { isAvailable, getClient } = require("../config/posthog");
const logger = require("../config/logger");

const capture = (distinctId, event, properties = {}) => {
  if (!isAvailable()) return;
  try {
    getClient().capture({
      distinctId: String(distinctId),
      event,
      properties,
    });
  } catch (err) {
    logger.warn({ err }, "Analytics capture failed");
  }
};

module.exports = { capture };
