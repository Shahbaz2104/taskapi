const express = require("express");
const router = express.Router();
const tasksController = require("../controllers/tasks_controller.js");
const { protect } = require("../middleware/auth_middleware.js");
const { authorize } = require("../middleware/rbac.js");
const {
  createTaskRules,
  updateTaskRules,
  idRule,
  bulkTaskRules,
  shareIdRule,
} = require("../middleware/validate.js");
const { zodValidate } = require("../middleware/zod_validate.js");
const collabController = require("../controllers/collab_controller.js");

// Public iCal feed — authenticated by per-user feed token in the query
// string (calendar clients can't send Authorization headers), so it is
// registered before router.use(protect)
router.get("/calendar.ics", tasksController.getCalendarFeed);

router.use(protect);

// Static routes must be registered before "/:id"
router.get("/stats", tasksController.getStats);
router.get("/export", tasksController.exportTasks);
router.get("/trash", tasksController.listTrashedTasks);
router.get("/all", authorize("admin"), tasksController.getAllTasksAdmin);
router.patch("/bulk", bulkTaskRules, tasksController.bulkTasks);
router.delete("/trash", tasksController.clearTrash);
router.post(
  "/import",
  express.text({ type: "text/csv", limit: "2mb" }),
  tasksController.importTasks
);

router.get("/", tasksController.getAllTasks);
router.get("/:id", idRule, tasksController.getTaskById);
router.post("/", createTaskRules, tasksController.createTask);
router.put("/:id", idRule, updateTaskRules, tasksController.updateTask);
router.delete("/:id", idRule, tasksController.deleteTask);

// Collaboration (nested under an existing task) — access is resolved by
// the collab chokepoint: owner > editor > viewer; strangers get 404
router.post(
  "/:id/shares",
  idRule,
  zodValidate(collabController.createShareSchema),
  collabController.createShare
);
router.get("/:id/shares", idRule, collabController.listShares);
router.delete(
  "/:id/shares/:shareId",
  idRule,
  shareIdRule,
  collabController.revokeShare
);
router.get("/:id/comments", idRule, collabController.listComments);
router.post(
  "/:id/comments",
  idRule,
  zodValidate(collabController.createCommentSchema),
  collabController.addComment
);
router.get("/:id/activity", idRule, collabController.getActivity);

module.exports = router;
