const express = require("express");
const router = express.Router();
const userController = require("../controllers/user_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const {
  changePasswordRules,
  updateMeRules,
  sessionIdRule,
} = require("../middleware/validate.js");

router.use(protect);

router.get("/", userController.getMe);
router.patch("/", updateMeRules, userController.updateMe);
router.put("/password", changePasswordRules, userController.changePassword);
router.get("/sessions", userController.listSessions);
router.delete(
  "/sessions/:sessionId",
  sessionIdRule,
  userController.revokeSession
);
router.delete("/", userController.deleteMe);

module.exports = router;
