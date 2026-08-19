const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const { authorize } = require("../middleware/rbac.js");
const { roleRule, userIdRule } = require("../middleware/validate.js");

router.use(protect, authorize("admin"));

router.get("/users", adminController.listUsers);
router.patch("/users/:id", roleRule, adminController.updateUserRole);
router.delete("/users/:id", userIdRule, adminController.deleteUser);

module.exports = router;
