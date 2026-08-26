import logger from "../config/logger.js";
import { getClient, isAvailable } from "../config/posthog.js";

const capture = (
  distinctId: unknown,
  event: string,
  properties: Record<string, unknown> = {}
): void => {
  if (!isAvailable()) return;
  try {
    getClient()?.capture({
      distinctId: String(distinctId),
      event,
      properties,
    });
  } catch (err) {
    logger.warn({ err }, "Analytics capture failed");
  }
};

export { capture };
