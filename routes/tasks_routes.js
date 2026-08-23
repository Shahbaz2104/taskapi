const express = require("express");
const router = express.Router();
const tasksController = require("../controllers/tasks_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const { authorize } = require("../middleware/rbac.js");
const {
  createTaskRules,
  updateTaskRules,
  idRule,
  bulkTaskRules,
} = require("../middleware/validate.js");

router.use(protect);

// Static routes must be registered before "/:id"
router.get("/stats", tasksController.getStats);
router.get("/export", tasksController.exportTasks);
router.get("/trash", tasksController.listTrashedTasks);
router.get("/all", authorize("admin"), tasksController.getAllTasksAdmin);
router.patch("/bulk", bulkTaskRules, tasksController.bulkTasks);
router.delete("/trash", tasksController.clearTrash);

router.get("/", tasksController.getAllTasks);
router.get("/:id", idRule, tasksController.getTaskById);
router.post("/", createTaskRules, tasksController.createTask);
router.put("/:id", idRule, updateTaskRules, tasksController.updateTask);
router.delete("/:id", idRule, tasksController.deleteTask);

module.exports = router;
