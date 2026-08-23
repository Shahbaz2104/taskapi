// Webhook delivery fan-out + HMAC signing. Task-domain services call
// emitTaskEvent() at their existing transition points; each subscribed,
// active webhook gets a signed delivery enqueued on the webhooks queue.

const crypto = require("crypto");
const { Queue } = require("bullmq");
const Webhook = require("../models/webhooks_models.js");
const { getClient, isAvailable } = require("../config/redis");
const {
  QUEUES,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
} = require("../config/constants");
const logger = require("../config/logger");

const newWebhookSecret = () => crypto.randomBytes(32).toString("hex");

// Signs `${timestamp}.${rawBody}` so receivers can reject replays by
// comparing X-TaskAPI-Timestamp against their own clock
const signPayload = (secret, timestamp, rawBody) =>
  `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;

// Enqueue deliveries for every active webhook of the user subscribed to
// the event. Best-effort: without Redis (or on any error) the product
// request path is never blocked.
const enqueueDeliveries = async ({ userId, event, payload }) => {
  if (!isAvailable()) return;
  try {
    const hooks = await Webhook.find({
      user: userId,
      active: true,
      events: event,
    }).lean();
    if (hooks.length === 0) return;

    const queue = new Queue(QUEUES.WEBHOOKS, { connection: getClient() });
    const now = new Date();
    const deliveryId = crypto.randomUUID();
    const rawBody = JSON.stringify({
      id: deliveryId,
      event,
      createdAt: now.toISOString(),
      data: payload,
    });

    await queue.addBulk(
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
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: true,
        },
      }))
    );
    await queue.close();
  } catch (err) {
    logger.warn({ err }, "Failed to enqueue webhook deliveries");
  }
};

// Thin wrapper used by task-domain transition points
const emitTaskEvent = (userId, event, task) =>
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

const recordDeliverySuccess = async (webhookId) => {
  await Webhook.updateOne(
    { _id: webhookId },
    { $set: { consecutiveFailures: 0 } }
  );
};

// Returns true when this failure tripped the circuit breaker
const recordDeliveryFailure = async (webhookId) => {
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

module.exports = {
  newWebhookSecret,
  signPayload,
  enqueueDeliveries,
  emitTaskEvent,
  recordDeliverySuccess,
  recordDeliveryFailure,
};
