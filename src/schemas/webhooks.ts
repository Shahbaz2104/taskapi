import { z } from "zod";
import { WEBHOOK_EVENTS } from "../config/constants.js";

export const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
});

export const updateWebhookSchema = z
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
