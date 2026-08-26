import { z } from "zod";
import {
  RECURRENCES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../config/constants.js";

const isoDateMessage = "Due date must be a valid ISO 8601 date";

const isIso8601 = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));

const tagField = z
  .string()
  .trim()
  .min(1, "Each tag must be 1-30 characters")
  .max(30, "Each tag must be 1-30 characters");

const tagsField = z.array(tagField).max(5, "At most 5 tags per task");

const baseTaskFields = {
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be at most 2000 characters"),
  priority: z.enum(TASK_PRIORITIES, {
    message: "Priority must be low, medium or high",
  }),
  dueDate: z.string().refine(isIso8601, { message: isoDateMessage }),
  tags: tagsField,
  recurrence: z.enum(RECURRENCES, {
    message: "Recurrence must be daily, weekly or monthly",
  }),
};

export const createTaskSchema = z.object({
  title: baseTaskFields.title,
  description: baseTaskFields.description.optional(),
  priority: baseTaskFields.priority.optional(),
  dueDate: baseTaskFields.dueDate.optional(),
  tags: tagsField.optional(),
  recurrence: baseTaskFields.recurrence.optional(),
});

export const updateTaskSchema = z.object({
  title: baseTaskFields.title.optional(),
  description: baseTaskFields.description.optional(),
  status: z
    .enum(TASK_STATUSES, {
      message: "Status must be pending, in_progress or completed",
    })
    .optional(),
  priority: baseTaskFields.priority.optional(),
  dueDate: baseTaskFields.dueDate.nullable().optional(),
  tags: tagsField.nullable().optional(),
  recurrence: baseTaskFields.recurrence.nullable().optional(),
});
