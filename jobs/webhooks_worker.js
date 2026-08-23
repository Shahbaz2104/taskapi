// Signed webhook delivery worker. Deliveries POST the raw JSON body with
// HMAC-SHA256 signature headers and retry with exponential backoff; after
// WEBHOOK_MAX_CONSECUTIVE_FAILURES consecutive failures the webhook is
// auto-deactivated (circuit breaker) so dead endpoints stop consuming
// queue attempts.

const { Worker } = require("bullmq");
const webhooksService = require("../services/webhooks.service.js");
const { getClient, isAvailable } = require("../config/redis");
const { QUEUES } = require("../config/constants");
const logger = require("../config/logger");

const DELIVERY_TIMEOUT_MS = 5000;

// Exported for direct testing — call with a job-shaped data object and a
// stubbed global.fetch
const performDelivery = async ({ webhookId, url, secret, event, rawBody }) => {
  const timestamp = String(Date.now());
  const signature = webhooksService.signPayload(secret, timestamp, rawBody);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TaskAPI-Webhooks/1.0",
        "X-TaskAPI-Event": event,
        "X-TaskAPI-Timestamp": timestamp,
        "X-TaskAPI-Signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw Object.assign(
        new Error(`Delivery endpoint responded ${res.status}`),
        { status: res.status }
      );
    }

    await webhooksService.recordDeliverySuccess(webhookId);
    return { ok: true, status: res.status };
  } catch (err) {
    const disabledNow = await webhooksService.recordDeliveryFailure(webhookId);
    if (disabledNow) {
      logger.warn(
        { webhookId, url },
        "Webhook auto-disabled after consecutive delivery failures"
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

let worker = null;

const startWebhooksWorker = () => {
  if (!isAvailable() || worker) return;
  worker = new Worker(
    QUEUES.WEBHOOKS,
    async (job) => performDelivery(job.data),
    {
      connection: getClient(),
    }
  );
  worker.on("failed", (job, err) =>
    logger.error(
      { err, jobId: job?.id, attempt: job?.attemptsMade },
      "Webhook delivery failed"
    )
  );
  logger.info("Webhook worker started");
};

module.exports = { startWebhooksWorker, performDelivery, DELIVERY_TIMEOUT_MS };
