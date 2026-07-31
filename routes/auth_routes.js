const express = require("express");
const authController = require("../controllers/auth_controller.js");
const { registerRules, loginRules } = require("../middleware/validate.js");
const router = express.Router();

router.post("/register", registerRules, authController.register);
router.post("/login", loginRules, authController.login);

module.exports = router;
