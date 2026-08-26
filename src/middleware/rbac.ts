import type { NextFunction, Request, Response } from "express";
import type { Role } from "../config/constants.js";

const authorize =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };

export { authorize };
