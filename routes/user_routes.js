const express = require("express");
const router = express.Router();
const userController = require("../controllers/user_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const {
  changePasswordRules,
  updateMeRules,
} = require("../middleware/validate.js");

router.use(protect);

router.get("/", userController.getMe);
router.patch("/", updateMeRules, userController.updateMe);
router.put("/password", changePasswordRules, userController.changePassword);
router.delete("/", userController.deleteMe);

module.exports = router;
