const User = require("../models/users_models.js");
const jwt = require("jsonwebtoken");

// Signup
const register = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ error: "User exists" });

  const user = await User.create({ username, password });
  res.status(201).json({ message: "User created", userId: user._id });
};

// Login
const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  res.status(200).json({ token });
};

module.exports = { register, login };
