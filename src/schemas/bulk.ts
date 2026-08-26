import { z } from "zod";
import { TASK_PRIORITIES } from "../config/constants.js";

const MONGO_ID = /^[0-9a-fA-F]{24}$/;

const BULK_ACTIONS = ["complete", "trash", "restore", "purge", "priority"];

export const bulkTaskSchema = z
  .object({
    ids: z
      .array(z.string().regex(MONGO_ID, "Each id must be a valid task ID"))
      .min(1, "ids must be an array of 1–100 task IDs")
      .max(100, "ids must be an array of 1–100 task IDs"),
    action: z.enum(BULK_ACTIONS as [string, ...string[]], {
      message: `Action must be one of: ${BULK_ACTIONS.join(", ")}`,
    }),
    priority: z
      .enum(TASK_PRIORITIES, {
        message: "Priority must be low, medium or high",
      })
      .optional(),
  })
  .refine((v) => v.action !== "priority" || Boolean(v.priority), {
    message: "A priority is required when action is priority",
  });

export type BulkActionValue = (typeof BULK_ACTIONS)[number];
