const Task = require("../models/tasks_models.js");

// GET /tasks?page=1&limit=10&status=pending
/**
 * @swagger
 * /tasks:
 *   get:
 *     summary: List your tasks (paginated, filterable)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 }, description: Page number (1-based) }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 10 }, description: Results per page }
 *       - { name: status, in: query, schema: { type: string, enum: [pending, completed] }, description: Filter by status }
 *     responses:
 *       200:
 *         description: Paginated task list
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/TaskList" }
 *       400:
 *         description: Invalid status filter
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 */
const getAllTasks = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

  const filter = { user: req.user.userId };
  if (req.query.status !== undefined) {
    if (req.query.status !== "pending" && req.query.status !== "completed") {
      return res
        .status(400)
        .json({ error: "Status must be pending or completed" });
    }
    filter.status = req.query.status;
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Task.countDocuments(filter),
  ]);

  res.status(200).json({
    tasks,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
};

// GET /tasks/all — admin only: every task across all users
/**
 * @swagger
 * /tasks/all:
 *   get:
 *     summary: List every user's tasks (admin only)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All tasks across all users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: "#/components/schemas/Task" }
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
const getAllTasksAdmin = async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.status(200).json(tasks);
};

// GET /tasks/:id
/**
 * @swagger
 * /tasks/{id}:
 *   get:
 *     summary: Get one of your tasks
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     responses:
 *       200:
 *         description: The task
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const getTaskById = async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    user: req.user.userId,
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(200).json(task);
};

// POST /tasks
/**
 * @swagger
 * /tasks:
 *   post:
 *     summary: Create a task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, maxLength: 200, example: "Write audit report" }
 *               description: { type: string, maxLength: 2000, example: "Document all findings" }
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Missing or invalid token
 */
const createTask = async (req, res) => {
  const { title, description } = req.body;
  const task = await Task.create({ title, description, user: req.user.userId });
  res.status(201).json(task);
};

// PUT /tasks/:id
/**
 * @swagger
 * /tasks/{id}:
 *   put:
 *     summary: Update a task (at least one field)
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 200, example: "Write final audit report" }
 *               description: { type: string, maxLength: 2000 }
 *               status: { type: string, enum: [pending, completed] }
 *     responses:
 *       200:
 *         description: Updated task
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Task" }
 *       400:
 *         description: Invalid input or empty update body
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const updateTask = async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res
      .status(400)
      .json({ error: "At least one field to update is required" });
  }

  // Whitelist fields — prevents mass assignment (e.g. reassigning `user`)
  const allowedUpdates = ["title", "description", "status"];
  const updates = {};
  for (const field of allowedUpdates) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ error: "At least one field to update is required" });
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user.userId },
    updates,
    { returnDocument: "after", runValidators: true }
  );
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(200).json(task);
};

// DELETE /tasks/:id
/**
 * @swagger
 * /tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: Task ID }
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Task not found
 */
const deleteTask = async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: req.params.id,
    user: req.user.userId,
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.status(204).send();
};

module.exports = {
  getAllTasks,
  getAllTasksAdmin,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
