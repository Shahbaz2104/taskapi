const User = require("../models/users_models.js");
const Task = require("../models/tasks_models.js");
const Token = require("../models/token_models.js");

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List users (admin only)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { name: search, in: query, schema: { type: string }, description: Search by username or email }
 *       - { name: role, in: query, schema: { type: string, enum: [admin, user] }, description: Filter by role }
 *     responses:
 *       200:
 *         description: Paginated user list
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 */
const listUsers = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

  const filter = {};
  if (req.query.role === "admin" || req.query.role === "user") {
    filter.role = req.query.role;
  }
  if (req.query.search) {
    filter.$or = [
      { username: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  res
    .status(200)
    .json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
};

/**
 * @swagger
 * /admin/users/{id}:
 *   patch:
 *     summary: Change a user's role (admin only, cannot demote yourself)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: User ID }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [admin, user] }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Cannot change your own role
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 *       404:
 *         description: User not found
 */
const updateUserRole = async (req, res) => {
  if (req.params.id === String(req.user.userId)) {
    return res.status(400).json({ error: "You cannot change your own role" });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: req.body.role },
    { returnDocument: "after" }
  ).select("-password");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.status(200).json(user);
};

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     summary: Delete a user and their data (admin only, cannot delete yourself)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string }, description: User ID }
 *     responses:
 *       204:
 *         description: User deleted
 *       400:
 *         description: Cannot delete your own account
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not an admin
 *       404:
 *         description: User not found
 */
const deleteUser = async (req, res) => {
  if (req.params.id === String(req.user.userId)) {
    return res
      .status(400)
      .json({ error: "You cannot delete your own account" });
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  await Promise.all([
    Task.deleteMany({ user: user._id }),
    Token.deleteMany({ user: user._id }),
  ]);
  res.status(204).send();
};

module.exports = { listUsers, updateUserRole, deleteUser };
