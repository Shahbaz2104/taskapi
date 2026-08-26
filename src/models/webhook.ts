import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { WEBHOOK_EVENTS } from "../config/constants.js";

const webhookSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    secret: {
      type: String,
      required: true,
    },
    events: {
      type: [String],
      enum: [...WEBHOOK_EVENTS],
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export type WebhookAttrs = InferSchemaType<typeof webhookSchema>;

export type WebhookDocument = HydratedDocument<WebhookAttrs>;

export type WebhookModel = Model<WebhookAttrs>;

export const Webhook = model<WebhookAttrs>("Webhook", webhookSchema);
