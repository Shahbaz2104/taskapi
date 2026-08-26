import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";

interface IdempotencyOverrides {
  body: Record<string, unknown> | null;
}
const idempotencySchema = new Schema({
  key: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  statusCode: {
    type: Number,
    default: null,
  },
  body: {
    type: Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400,
  },
});

export type IdempotencyAttrs = InferSchemaType<typeof idempotencySchema>;

export type IdempotencyDocument = HydratedDocument<
  IdempotencyAttrs,
  IdempotencyOverrides
>;

export type IdempotencyModel = Model<IdempotencyAttrs>;

idempotencySchema.index({ user: 1, key: 1 }, { unique: true });

export const Idempotency = model<IdempotencyAttrs>(
  "Idempotency",
  idempotencySchema
);
