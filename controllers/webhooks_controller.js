const { z } = require("zod");
const { Queue } = require("bullmq");
const crypto = require("crypto");
const Webhook = require("../models/webhooks_models.js");
const webhooksService = require("../services/webhooks.service.js");
const analytics = require("../services/analytics.service.js");
const { getClient, isAvailable } = require("../config/redis");
const { QUEUES, WEBHOOK_EVENTS } = require("../config/constants");

// zod schemas (new-endpoint convention) — exported for route wiring
const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
});

const updateWebhookSchema = z
  .object({
    url: z.string().url().max(2048).optional(),
    events: z
      .array(z.enum(WEBHOOK_EVENTS))
      .min(1)
      .max(WEBHOOK_EVENTS.length)
      .optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

/**
 * @swagger
 * /me/webhooks:
 *   get:
 *     summary: List your webhook endpoints
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Webhooks (secrets included — owner-only view)
 */
const listWebhooks = async (req, res) => {
  const hooks = await Webhook.find({ user: req.user.userId }).sort({
    createdAt: -1,
  });
  res.status(200).json({ webhooks: hooks });
};

/**
 * @swagger
 * /me/webhooks:
 *   post:
 *     summary: Register a webhook endpoint
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, events]
 *             properties:
 *               url: { type: string, format: uri, maxLength: 2048 }
 *               events:
 *                 type: array
 *                 items: { type: string, enum: [task.created, task.completed, task.trashed, test.ping] }
 *     responses:
 *       201:
 *         description: Created — store the signing secret now, deliveries carry X-TaskAPI-Signature headers
 *       400:
 *         description: Invalid payload
 */
const createWebhook = async (req, res) => {
  const hook = await Webhook.create({
    user: req.user.userId,
    url: req.body.url,
    events: req.body.events,
    secret: webhooksService.newWebhookSecret(),
  });
  analytics.capture(req.user.userId, "webhook_created", {
    eventCount: hook.events.length,
  });
  res.status(201).json(hook);
};

/**
 * @swagger
 * /me/webhooks/{id}:
 *   patch:
 *     summary: Update a webhook's URL, subscriptions, or active flag
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Updated webhook
 *       404:
 *         description: Not found or not yours
 */
const updateWebhook = async (req, res) => {
  const updates = {};
  for (const key of ["url", "events", "active"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.active === true) {
    // Re-arming a disabled webhook resets its failure counter
    updates.consecutiveFailures = 0;
  }
  const hook = await Webhook.findOneAndUpdate(
    { _id: req.params.id, user: req.user.userId },
    { $set: updates },
    { new: true }
  );
  if (!hook) return res.status(404).json({ error: "Webhook not found" });
  res.status(200).json(hook);
};

/**
 * @swagger
 * /me/webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook endpoint
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found or not yours
 */
const deleteWebhook = async (req, res) => {
  const result = await Webhook.deleteOne({
    _id: req.params.id,
    user: req.user.userId,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Webhook not found" });
  }
  analytics.capture(req.user.userId, "webhook_deleted");
  res.status(204).send();
};

/**
 * @swagger
 * /me/webhooks/{id}/ping:
 *   post:
 *     summary: Send a signed test.ping delivery to verify the endpoint
 *     tags: [Account]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       202:
 *         description: Test delivery enqueued (queued:false when the queue backend is unavailable)
 *       404:
 *         description: Not found or not yours
 */
const pingWebhook = async (req, res) => {
  const hook = await Webhook.findOne({
    _id: req.params.id,
    user: req.user.userId,
  });
  if (!hook) return res.status(404).json({ error: "Webhook not found" });

  let queued = false;
  if (isAvailable()) {
    try {
      const queue = new Queue(QUEUES.WEBHOOKS, { connection: getClient() });
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
  analytics.capture(req.user.userId, "webhook_ping_tested");
  res.status(202).json({ queued });
};

module.exports = {
  createWebhookSchema,
  updateWebhookSchema,
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  pingWebhook,
};
