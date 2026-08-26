import { z } from "zod";

export const createShareSchema = z.object({
  username: z.string().trim().min(3).max(30),
  role: z.enum(["viewer", "editor"]),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
