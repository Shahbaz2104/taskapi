import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/user.js";
import type { DecodedAccessToken, RequestUser } from "../types/auth.js";
import { AuthenticationError } from "../errors/index.js";

export const currentUser = (req: Request): RequestUser => {
  if (!req.user) throw new AuthenticationError();
  return req.user;
};

const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  try {
    const decoded = jwt.verify(
      token,
      env.JWT_SECRET
    ) as unknown as DecodedAccessToken;
    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.userId !== "string"
    ) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }
    req.user = { userId: user._id, role: user.role };
    next();
  } catch (err) {
    if (err instanceof Error && err.name === "TokenExpiredError") {
      res.status(401).json({ error: "Token expired, please log in again" });
      return;
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

export { protect };
