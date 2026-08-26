import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";

const taskShareSchema = new Schema(
  {
    task: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["viewer", "editor"],
      required: true,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export type TaskShareAttrs = InferSchemaType<typeof taskShareSchema>;

export type TaskShareDocument = HydratedDocument<TaskShareAttrs>;

export type ShareRole = NonNullable<TaskShareAttrs["role"]>;

export type TaskShareModel = Model<TaskShareAttrs>;

taskShareSchema.index({ task: 1, user: 1 }, { unique: true });

export const TaskShare = model<TaskShareAttrs>("TaskShare", taskShareSchema);
