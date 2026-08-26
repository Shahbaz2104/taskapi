import type { RequestUser } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
