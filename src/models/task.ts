import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";
import {
  RECURRENCES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../config/constants.js";

const taskSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: [...TASK_STATUSES],
      default: "pending",
    },
    priority: {
      type: String,
      enum: [...TASK_PRIORITIES],
      default: "medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) => value.length <= 5,
        message: "At most 5 tags per task",
      },
    },
    recurrence: {
      type: String,
      enum: [...RECURRENCES, null],
      default: null,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export type TaskAttrs = InferSchemaType<typeof taskSchema>;

export type TaskDocument = HydratedDocument<TaskAttrs>;

export type TaskModel = Model<TaskAttrs>;

taskSchema.index({ user: 1, createdAt: -1 });
taskSchema.index({ user: 1, deletedAt: -1 });
taskSchema.index({ title: "text", description: "text" });

export const Task = model<TaskAttrs>("Task", taskSchema);
