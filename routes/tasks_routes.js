const express = require("express");
const router = express.Router();
const tasksController = require("../controllers/tasks_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const { createTaskRules, updateTaskRules, idRule } = require("../middleware/validate.js");

router.use(protect);

router.get("/", tasksController.getAllTasks);
router.get("/:id", idRule, tasksController.getTasksbyId);
router.post("/", createTaskRules, tasksController.createTask);
router.put("/:id", idRule, updateTaskRules, tasksController.updateTask);
router.delete("/:id", idRule, tasksController.deleteTask);

module.exports = router;
