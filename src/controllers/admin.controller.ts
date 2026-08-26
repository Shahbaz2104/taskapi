import type { RequestHandler } from "express";
import { Task } from "../models/task.js";
import { Token } from "../models/token.js";
import { User } from "../models/user.js";
import { currentUser } from "../middleware/auth.js";

const listUsers: RequestHandler = async (req, res) => {
  currentUser(req);
  const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string, 10) || 10, 1),
    100
  );

  const filter: Record<string, unknown> = {};
  if (req.query.role === "admin" || req.query.role === "user") {
    filter.role = req.query.role;
  }
  if (req.query.search) {
    filter.$or = [
      { username: { $regex: req.query.search as string, $options: "i" } },
      { email: { $regex: req.query.search as string, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter as never)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter as never),
  ]);
  res
    .status(200)
    .json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
};

const updateUserRole: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  if (req.params.id === String(auth.userId)) {
    res.status(400).json({ error: "You cannot change your own role" });
    return;
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: (req.body as { role?: string }).role },
    { returnDocument: "after" }
  ).select("-password");
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.status(200).json(user);
};

const deleteUser: RequestHandler = async (req, res) => {
  const auth = currentUser(req);
  if (req.params.id === String(auth.userId)) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await Promise.all([
    Task.deleteMany({ user: user._id }),
    Token.deleteMany({ user: user._id }),
  ]);
  res.status(204).send();
};

export { listUsers, updateUserRole, deleteUser };
