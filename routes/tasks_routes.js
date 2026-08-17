const express = require("express");
const router = express.Router();
const tasksController = require("../controllers/tasks_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const { authorize } = require("../middleware/rbac.js");
const {
  createTaskRules,
  updateTaskRules,
  idRule,
} = require("../middleware/validate.js");

router.use(protect);

// Admin-only route — must be registered before "/:id"
router.get("/all", authorize("admin"), tasksController.getAllTasksAdmin);

router.get("/", tasksController.getAllTasks);
router.get("/:id", idRule, tasksController.getTaskById);
router.post("/", createTaskRules, tasksController.createTask);
router.put("/:id", idRule, updateTaskRules, tasksController.updateTask);
router.delete("/:id", idRule, tasksController.deleteTask);

module.exports = router;
