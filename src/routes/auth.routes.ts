import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { buildLimiter } from "../config/rate_limit.js";
import { zodValidate } from "../middleware/zod.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  challenge2faSchema,
} from "../schemas/auth.js";

const router = Router();

const skipInTest = (): boolean => process.env.NODE_ENV === "test";

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many login attempts, please try again later" },
  skip: skipInTest,
});

const registerLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many registration attempts, please try again later" },
  skip: skipInTest,
});

const forgotLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { error: "Too many requests, please try again later" },
  skip: skipInTest,
});

const resetLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many requests, please try again later" },
  skip: skipInTest,
});

const refreshLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: "Too many requests, please try again later" },
  skip: skipInTest,
});

router.post(
  "/register",
  registerLimiter,
  zodValidate(registerSchema),
  authController.register
);
router.post(
  "/login",
  loginLimiter,
  zodValidate(loginSchema),
  authController.login
);
router.post(
  "/2fa/challenge",
  loginLimiter,
  zodValidate(challenge2faSchema),
  authController.verify2faChallenge
);
router.post(
  "/refresh",
  refreshLimiter,
  zodValidate(refreshSchema),
  authController.refresh
);
router.post("/logout", zodValidate(refreshSchema), authController.logout);
router.post(
  "/verify-email",
  zodValidate(verifyEmailSchema),
  authController.verifyEmail
);
router.post(
  "/forgot-password",
  forgotLimiter,
  zodValidate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  resetLimiter,
  zodValidate(resetPasswordSchema),
  authController.resetPassword
);

export default router;
