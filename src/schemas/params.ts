import { z } from "zod";

const MONGO_ID = /^[0-9a-fA-F]{24}$/;

export const mongoIdParam = (field: string, message: string) =>
  z.object({ [field]: z.string().regex(MONGO_ID, message) });

export const taskIdParamSchema = mongoIdParam("id", "Invalid task ID");
export const userIdParamSchema = mongoIdParam("id", "Invalid user ID");
export const sessionIdParamSchema = mongoIdParam(
  "sessionId",
  "Invalid session ID"
);
export const shareIdParamSchema = mongoIdParam("shareId", "Invalid share ID");

export type MongoIdParams = { [key: string]: string };
