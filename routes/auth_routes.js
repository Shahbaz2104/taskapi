const express = require("express");
const authController = require("../controllers/auth_controller.js");
const { buildLimiter } = require("../config/rate_limit.js");
const {
  registerRules,
  loginRules,
  refreshRules,
  verifyEmailRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require("../middleware/validate.js");
const router = express.Router();

const skipInTest = () => process.env.NODE_ENV === "test";

// Stricter limiters to slow down brute-force and account spam.
// Skipped under test so the shared test IP doesn't trip the limit.
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
  registerRules,
  authController.register
);
router.post("/login", loginLimiter, loginRules, authController.login);
router.post("/refresh", refreshLimiter, refreshRules, authController.refresh);
router.post("/logout", refreshRules, authController.logout);
router.post("/verify-email", verifyEmailRules, authController.verifyEmail);
router.post(
  "/forgot-password",
  forgotLimiter,
  forgotPasswordRules,
  authController.forgotPassword
);
router.post(
  "/reset-password",
  resetLimiter,
  resetPasswordRules,
  authController.resetPassword
);

module.exports = router;
