const { body, param, validationResult } = require("express-validator");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
};

const registerRules = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").trim().notEmpty().withMessage("Password is required"),
  handleValidation,
];

const loginRules = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").trim().notEmpty().withMessage("Password is required"),
  handleValidation,
];

const createTaskRules = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  handleValidation,
];

const updateTaskRules = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
  body("description").optional().trim(),
  body("status")
    .optional()
    .isIn(["pending", "completed"])
    .withMessage("Status must be pending or completed"),
  handleValidation,
];

const idRule = [
  param("id").isMongoId().withMessage("Invalid task ID"),
  handleValidation,
];

module.exports = {
  registerRules,
  loginRules,
  createTaskRules,
  updateTaskRules,
  idRule,
};
