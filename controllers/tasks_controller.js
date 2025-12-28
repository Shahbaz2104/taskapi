let tasks = [];
let currentId = 1;

const getAllTasks = (req, res) => {
  res.status(200).json(tasks);
};

const getTasksbyId = (req, res) => {
  const id = parseInt(req.params.id);
  const task = tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ Error: "task not found" });
  res.status(200).json(task);
};

const createTask = (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(404).json({ error: "Title is required" });

  const newTask = {
    id: currentId++,
    title,
    description: description || "",
    status: "pending",
    createdAt: new Date(),
  };

  tasks.push(newTask);
  res.status(201).json(newTask);
};

const updateTask = (req, res) => {
  const id = parseInt(req.params.id);
  const task = tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ error: "task not found" });

  const { title, description, status } = req.body;

  if (title) task.title = title;
  if (description) task.description = description;
  if (status) task.status = status;
  res.status(200).json(task);
};

const deleteTask = (req, res) => {
  const { id } = parseInt(req.params.id);
  const index = tasks.find((t) => t.id === id);
  if (index === -1) return res.status(404).json({ error: "task not found" });

  tasks.splice(index, 1);
  res.status(204).send();
};

module.exports = {
  getAllTasks,
  getTasksbyId,
  createTask,
  updateTask,
  deleteTask,
};
