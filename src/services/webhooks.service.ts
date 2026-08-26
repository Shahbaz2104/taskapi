import crypto from "node:crypto";
import type { Types } from "mongoose";
import { Queue } from "bullmq";
import logger from "../config/logger.js";
import { getClient, isAvailable } from "../config/redis.js";
import {
  QUEUES,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  type WebhookEvent,
} from "../config/constants.js";
import { Webhook, type WebhookAttrs } from "../models/webhook.js";

export interface WebhookDeliveryJob {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  rawBody: string;
}

const newWebhookSecret = (): string => crypto.randomBytes(32).toString("hex");

const signPayload = (
  secret: string,
  timestamp: number | string,
  rawBody: string
): string =>
  `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;

let queue: Queue<WebhookDeliveryJob> | null = null;

const getQueue = (): Queue<WebhookDeliveryJob> | null => {
  if (!queue && isAvailable()) {
    queue = new Queue<WebhookDeliveryJob>(QUEUES.WEBHOOKS, {
      connection: getClient() as never,
    });
  }
  return queue;
};

interface DeliveryInput {
  userId: string | Types.ObjectId;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}

const enqueueDeliveries = async ({
  userId,
  event,
  payload,
}: DeliveryInput): Promise<void> => {
  if (!isAvailable()) return;
  try {
    const hooks = (await Webhook.find({
      user: userId,
      active: true,
      events: { $in: [event] },
    }).lean()) as unknown as (WebhookAttrs & { _id: Types.ObjectId })[];

    if (hooks.length === 0) return;

    const deliveryQueue = getQueue();
    if (!deliveryQueue) return;

    const now = new Date();
    const deliveryId = crypto.randomUUID();
    const rawBody = JSON.stringify({
      id: deliveryId,
      event,
      createdAt: now.toISOString(),
      data: payload,
    });

    await deliveryQueue.addBulk(
      hooks.map((hook) => ({
        name: event,
        data: {
          webhookId: String(hook._id),
          url: hook.url,
          secret: hook.secret,
          event,
          rawBody,
        },
        opts: {
          attempts: 5,
          backoff: { type: "exponential" as const, delay: 2000 },
          removeOnComplete: true,
        },
      }))
    );
  } catch (err) {
    logger.warn({ err }, "Failed to enqueue webhook deliveries");
  }
};

interface EmittedTask {
  _id: unknown;
  title: string;
  status: string;
  priority: string;
  dueDate?: Date | null | undefined;
}

const emitTaskEvent = (
  userId: string | Types.ObjectId,
  event: WebhookEvent,
  task: EmittedTask
): Promise<void> =>
  enqueueDeliveries({
    userId,
    event,
    payload: {
      _id: String(task._id),
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate || null,
    },
  });

const recordDeliverySuccess = async (webhookId: string): Promise<void> => {
  await Webhook.updateOne(
    { _id: webhookId },
    { $set: { consecutiveFailures: 0 } }
  );
};

const recordDeliveryFailure = async (webhookId: string): Promise<boolean> => {
  const hook = await Webhook.findById(webhookId).select(
    "consecutiveFailures active"
  );
  if (!hook || !hook.active) return false;

  const failures = hook.consecutiveFailures + 1;
  if (failures >= WEBHOOK_MAX_CONSECUTIVE_FAILURES) {
    await Webhook.updateOne(
      { _id: webhookId },
      { $set: { consecutiveFailures: failures, active: false } }
    );
    return true;
  }
  await Webhook.updateOne(
    { _id: webhookId },
    { $set: { consecutiveFailures: failures } }
  );
  return false;
};

export {
  newWebhookSecret,
  signPayload,
  enqueueDeliveries,
  emitTaskEvent,
  recordDeliverySuccess,
  recordDeliveryFailure,
};
