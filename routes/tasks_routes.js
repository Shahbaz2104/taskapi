const express = require("express");
const router = express.Router();
const tasksController = require("../controllers/tasks_controller.js");

router.get("/", tasksController.getAllTasks);
router.get("/:id", tasksController.getTasksbyId);
router.post("/", tasksController.createTask);
router.put("/:id", tasksController.updateTask);
router.delete("/:id", tasksController.deleteTask);

module.exports = router;
