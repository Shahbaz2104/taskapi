import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type ValidationSource = "body" | "query" | "params";

const zodValidate =
  (schema: ZodType, source: ValidationSource = "body"): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req[source] as unknown);
    if (!result.success) {
      const issue = result.error.issues[0];
      const label = [source, ...(issue?.path ?? [])].filter(Boolean).join(".");
      res.status(400).json({
        error: issue ? `${label}: ${issue.message}` : `${label}: Invalid input`,
      });
      return;
    }
    if (source === "body") {
      (req as unknown as { body: unknown }).body = result.data;
    }
    next();
  };

export { zodValidate };
export type { ValidationSource };
