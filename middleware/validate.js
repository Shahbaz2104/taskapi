const { body, param, validationResult } = require("express-validator");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
};

const registerRules = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6, max: 72 })
    .withMessage("Password must be between 6 and 72 characters"),
  handleValidation,
];

const loginRules = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidation,
];

const refreshRules = [
  body("refreshToken").notEmpty().withMessage("Refresh token is required"),
  handleValidation,
];

const verifyEmailRules = [
  body("token").notEmpty().withMessage("Verification token is required"),
  handleValidation,
];

const forgotPasswordRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  handleValidation,
];

const resetPasswordRules = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6, max: 72 })
    .withMessage("Password must be between 6 and 72 characters"),
  handleValidation,
];

const changePasswordRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6, max: 72 })
    .withMessage("Password must be between 6 and 72 characters"),
  handleValidation,
];

const updateMeRules = [
  body("username")
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters"),
  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  handleValidation,
];

// Skip undefined/null (absent) values but still validate empty strings
const isDefined = (value) => value !== undefined && value !== null;

const taskFields = (optional) => {
  const titleChain = optional ? body("title").if(isDefined) : body("title");
  return [
    titleChain
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 200 })
      .withMessage("Title must be at most 200 characters"),
    body("description")
      .if(isDefined)
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Description must be at most 2000 characters"),
    body("priority")
      .if(isDefined)
      .isIn(["low", "medium", "high"])
      .withMessage("Priority must be low, medium or high"),
    body("dueDate")
      .if(isDefined)
      .isISO8601()
      .withMessage("Due date must be a valid ISO 8601 date"),
    body("tags")
      .if(isDefined)
      .isArray({ max: 5 })
      .withMessage("At most 5 tags per task")
      .custom((tags) =>
        tags.every(
          (t) =>
            typeof t === "string" &&
            t.trim().length > 0 &&
            t.trim().length <= 30
        )
      )
      .withMessage("Each tag must be 1-30 characters")
      .customSanitizer((tags) =>
        Array.isArray(tags) ? tags.map((t) => t.trim()) : tags
      ),
    body("recurrence")
      .if(isDefined)
      .isIn(["daily", "weekly", "monthly"])
      .withMessage("Recurrence must be daily, weekly or monthly"),
  ];
};

const createTaskRules = [...taskFields(false), handleValidation];

const updateTaskRules = [
  ...taskFields(true),
  body("status")
    .if(isDefined)
    .isIn(["pending", "in_progress", "completed"])
    .withMessage("Status must be pending, in_progress or completed"),
  handleValidation,
];

const mongoIdParamRule = (field, message) => [
  param(field).isMongoId().withMessage(message),
  handleValidation,
];

const idRule = mongoIdParamRule("id", "Invalid task ID");
const userIdRule = mongoIdParamRule("id", "Invalid user ID");
const sessionIdRule = mongoIdParamRule("sessionId", "Invalid session ID");

const roleRule = [
  ...userIdRule,
  body("role")
    .isIn(["admin", "user"])
    .withMessage("Role must be admin or user"),
  handleValidation,
];

module.exports = {
  registerRules,
  loginRules,
  refreshRules,
  verifyEmailRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
  updateMeRules,
  createTaskRules,
  updateTaskRules,
  idRule,
  userIdRule,
  sessionIdRule,
  roleRule,
};
