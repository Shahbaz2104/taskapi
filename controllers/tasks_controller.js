const Task = require("../models/tasks_models.js");

// GET /tasks
const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      user: req.user.userId
    });
    res.status(200).json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /tasks/:id
const getTasksbyId = async (req, res) => {
  try {
    const task = await Task.findById({_id :req.params.id, user: req.user.userId});
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /tasks
const createTask = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const task = await Task.create({ title, description , user: req.user.userId });
    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /tasks/:id
const updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate({ _id: req.params.id, user: req.user.userId }, req.body, { new: true });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /tasks/:id
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete({ _id: req.params.id, user: req.user.userId });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getAllTasks,
  getTasksbyId, // matches router
  createTask,
  updateTask,
  deleteTask,
};
