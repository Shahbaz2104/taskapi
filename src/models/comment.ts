import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";

const commentSchema = new Schema(
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
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

export type CommentAttrs = InferSchemaType<typeof commentSchema>;

export type CommentDocument = HydratedDocument<CommentAttrs>;

export type CommentModel = Model<CommentAttrs>;

commentSchema.index({ task: 1, createdAt: -1 });

export const Comment = model<CommentAttrs>("Comment", commentSchema);
