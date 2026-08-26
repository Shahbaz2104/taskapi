import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import logger from "../config/logger.js";

interface ErrorWithStatus {
  status?: unknown;
}

const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const log: Logger = (req as Request & { log?: Logger }).log ?? logger;
  log.error({ err }, "Unhandled request error");

  const { status } = err as ErrorWithStatus;
  const httpStatus = typeof status === "number" ? status : 500;
  const message =
    httpStatus >= 500
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Request failed";

  res.status(httpStatus).json({ error: message });
};

export { errorHandler };
