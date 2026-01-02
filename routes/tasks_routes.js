const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasks_controller.js'); // should point to your controller
const { protect } = require('../middleware/auth_middleware.js');

router.use(protect); // Apply authentication middleware to all task routes


router.get('/', tasksController.getAllTasks);      // function
router.get('/:id', tasksController.getTasksbyId);  // function
router.post('/', tasksController.createTask);
router.put('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);

module.exports = router;


