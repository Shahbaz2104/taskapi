import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { Queue } from "bullmq";
import { Webhook } from "../models/webhook.js";
import * as webhooksService from "../services/webhooks.service.js";
import type { WebhookDeliveryJob } from "../services/webhooks.service.js";
import { capture } from "../services/analytics.service.js";
import { getClient, isAvailable } from "../config/redis.js";
import { QUEUES, type WebhookEvent } from "../config/constants.js";
import { currentUser } from "../middleware/auth.js";

const createWebhook: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const body = req.body as { url: string; events: WebhookEvent[] };
  const hook = await Webhook.create({
    user: auth.userId,
    url: body.url,
    events: body.events,
    secret: webhooksService.newWebhookSecret(),
  });
  capture(auth.userId, "webhook_created", {
    eventCount: hook.events.length,
  });
  res.status(201).json(hook);
};

const updateWebhook: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const body = req.body as {
    url?: string;
    events?: WebhookEvent[];
    active?: boolean;
  };
  const updates: Record<string, unknown> = {};
  for (const key of ["url", "events", "active"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (updates.active === true) {
    // Re-arming a disabled webhook resets its failure counter
    updates.consecutiveFailures = 0;
  }
  const hook = await Webhook.findOneAndUpdate(
    { _id: req.params.id, user: auth.userId },
    { $set: updates },
    { new: true }
  );
  if (!hook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.status(200).json(hook);
};

const deleteWebhook: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const result = await Webhook.deleteOne({
    _id: req.params.id,
    user: auth.userId,
  });
  if (result.deletedCount === 0) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  capture(auth.userId, "webhook_deleted");
  res.status(204).send();
};

const pingWebhook: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const hook = await Webhook.findOne({
    _id: req.params.id,
    user: auth.userId,
  });
  if (!hook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  let queued = false;
  if (isAvailable()) {
    try {
      const queue = new Queue<WebhookDeliveryJob>(QUEUES.WEBHOOKS, {
        connection: getClient() as never,
      });
      await queue.add(
        "test.ping",
        {
          webhookId: String(hook._id),
          url: hook.url,
          secret: hook.secret,
          event: "test.ping",
          rawBody: JSON.stringify({
            id: crypto.randomUUID(),
            event: "test.ping",
            createdAt: new Date().toISOString(),
            data: { message: "TaskAPI webhook test delivery" },
          }),
        },
        { attempts: 1, removeOnComplete: true }
      );
      await queue.close();
      queued = true;
    } catch {
      // fall through with queued:false
    }
  }
  capture(auth.userId, "webhook_ping_tested");
  res.status(202).json({ queued });
};

const listWebhooks: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  const hooks = await Webhook.find({ user: auth.userId }).sort({
    createdAt: -1,
  });
  res.status(200).json({ webhooks: hooks });
};

export {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  pingWebhook,
};
