import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";

const tokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["refresh"],
      default: "refresh",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export type TokenAttrs = InferSchemaType<typeof tokenSchema>;

export type TokenDocument = HydratedDocument<TokenAttrs>;

export type TokenModel = Model<TokenAttrs>;

tokenSchema.index({ user: 1 });

export const Token = model<TokenAttrs>("Token", tokenSchema);
