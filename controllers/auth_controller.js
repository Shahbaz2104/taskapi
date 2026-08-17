const User = require("../models/users_models.js");
const jwt = require("jsonwebtoken");

// Signup — relies on the unique index + validation middleware;
// catches duplicate-key races and returns a token right away.
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create an account and get a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, minLength: 3, maxLength: 30, example: alice }
 *               password: { type: string, minLength: 6, maxLength: 72, example: secret1 }
 *     responses:
 *       201:
 *         description: User created, token returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "User created" }
 *                 userId: { type: string }
 *                 token: { type: string }
 *       400:
 *         description: Invalid input or username already exists
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 *       429:
 *         description: Too many registration attempts
 */
const register = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.create({ username, password });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(201).json({ message: "User created", userId: user._id, token });
  } catch (error) {
    // Duplicate username (unique index) — could race between checks
    if (error && error.code === 11000) {
      return res.status(400).json({ error: "User exists" });
    }
    throw error; // forwarded to the central error handler
  }
};

// Login
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and get a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: alice }
 *               password: { type: string, example: secret1 }
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/AuthResponse" }
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 *       429:
 *         description: Too many login attempts
 */
const login = async (req, res) => {
  const { username, password } = req.body;

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
