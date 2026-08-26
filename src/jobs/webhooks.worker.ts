import { Worker } from "bullmq";
import * as webhooksService from "../services/webhooks.service.js";
import type { WebhookDeliveryJob } from "../services/webhooks.service.js";
import { getClient, isAvailable } from "../config/redis.js";
import { QUEUES } from "../config/constants.js";
import logger from "../config/logger.js";

export const DELIVERY_TIMEOUT_MS = 5000;

const performDelivery = async (
  data: WebhookDeliveryJob
): Promise<{ ok: true; status: number }> => {
  const { webhookId, url, secret, event, rawBody } = data;
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
      const err: Error & { status?: number } = new Error(
        `Delivery endpoint responded ${res.status}`
      );
      err.status = res.status;
      throw err;
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

let worker: Worker<WebhookDeliveryJob> | null = null;

const startWebhooksWorker = (): void => {
  if (!isAvailable() || worker) return;
  worker = new Worker<WebhookDeliveryJob>(
    QUEUES.WEBHOOKS,
    async (job) => performDelivery(job.data),
    {
      connection: getClient() as never,
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

export { startWebhooksWorker, performDelivery };
