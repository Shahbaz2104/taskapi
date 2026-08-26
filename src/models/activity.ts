import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";

interface ActivityOverrides {
  meta: Record<string, unknown> | null;
}
const activitySchema = new Schema(
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
    action: {
      type: String,
      required: true,
      maxlength: 60,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type ActivityAttrs = InferSchemaType<typeof activitySchema>;

export type ActivityDocument = HydratedDocument<
  ActivityAttrs,
  ActivityOverrides
>;

export type ActivityModel = Model<ActivityAttrs>;

activitySchema.index({ task: 1, createdAt: -1 });

export const Activity = model<ActivityAttrs>("Activity", activitySchema);
