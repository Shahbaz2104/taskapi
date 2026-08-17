const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth_controller.js");
const { registerRules, loginRules } = require("../middleware/validate.js");
const router = express.Router();

// Stricter rate limit for login to slow down brute-force attempts.
// Skipped under test so the shared test IP doesn't trip the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many login attempts, please try again later" },
  skip: () => process.env.NODE_ENV === "test",
});

// Same guard for registration — prevents account spam / DB hammering.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many registration attempts, please try again later" },
  skip: () => process.env.NODE_ENV === "test",
});

router.post(
  "/register",
  registerLimiter,
  registerRules,
  authController.register
);
router.post("/login", loginLimiter, loginRules, authController.login);

module.exports = router;
