const express = require("express");
const router = express.Router();
const userController = require("../controllers/user_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const {
  changePasswordRules,
  updateMeRules,
  sessionIdRule,
  enable2faRules,
  disable2faRules,
} = require("../middleware/validate.js");

router.use(protect);

router.get("/", userController.getMe);
router.patch("/", updateMeRules, userController.updateMe);
router.put("/password", changePasswordRules, userController.changePassword);
// 2FA enrollment — challenge route is rate-limited in auth_routes
router.post("/2fa/setup", userController.setup2fa);
router.post("/2fa/enable", enable2faRules, userController.enable2fa);
router.post("/2fa/disable", disable2faRules, userController.disable2fa);
router.get("/sessions", userController.listSessions);
router.delete(
  "/sessions/:sessionId",
  sessionIdRule,
  userController.revokeSession
);
router.delete("/", userController.deleteMe);

module.exports = router;
