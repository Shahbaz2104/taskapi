import express, { Router } from "express";
import * as tasksController from "../controllers/tasks.controller.js";
import * as collabController from "../controllers/collab.controller.js";
import { protect } from "../middleware/auth.js";
import { authorize } from "../middleware/rbac.js";
import { zodValidate } from "../middleware/zod.js";
import { createTaskSchema, updateTaskSchema } from "../schemas/tasks.js";
import { bulkTaskSchema } from "../schemas/bulk.js";
import { taskIdParamSchema, shareIdParamSchema } from "../schemas/params.js";
import { createShareSchema, createCommentSchema } from "../schemas/sharing.js";

const router = Router();

// Public iCal feed — token-authenticated, registered before protect
router.get("/calendar.ics", tasksController.getCalendarFeed);

router.use(protect);

// Static routes must be registered before "/:id"
router.get("/stats", tasksController.getStats);
router.get("/export", tasksController.exportTasks);
router.get("/trash", tasksController.listTrashedTasks);
router.get("/all", authorize("admin"), tasksController.getAllTasksAdmin);
router.patch("/bulk", zodValidate(bulkTaskSchema), tasksController.bulkTasks);
router.delete("/trash", tasksController.clearTrash);
router.post(
  "/import",
  express.text({ type: "text/csv", limit: "2mb" }),
  tasksController.importTasks
);

router.get("/", tasksController.getAllTasks);
router.get(
  "/:id",
  zodValidate(taskIdParamSchema, "params"),
  tasksController.getTaskById
);
router.post("/", zodValidate(createTaskSchema), tasksController.createTask);
router.put(
  "/:id",
  zodValidate(taskIdParamSchema, "params"),
  zodValidate(updateTaskSchema),
  tasksController.updateTask
);
router.delete(
  "/:id",
  zodValidate(taskIdParamSchema, "params"),
  tasksController.deleteTask
);

// Collaboration — access resolved by the collab chokepoint
router.post(
  "/:id/shares",
  zodValidate(taskIdParamSchema, "params"),
  zodValidate(createShareSchema),
  collabController.createShare
);
router.get(
  "/:id/shares",
  zodValidate(taskIdParamSchema, "params"),
  collabController.listShares
);
router.delete(
  "/:id/shares/:shareId",
  zodValidate(taskIdParamSchema, "params"),
  zodValidate(shareIdParamSchema, "params"),
  collabController.revokeShare
);
router.get(
  "/:id/comments",
  zodValidate(taskIdParamSchema, "params"),
  collabController.listComments
);
router.post(
  "/:id/comments",
  zodValidate(taskIdParamSchema, "params"),
  zodValidate(createCommentSchema),
  collabController.addComment
);
router.get(
  "/:id/activity",
  zodValidate(taskIdParamSchema, "params"),
  collabController.getActivity
);

export default router;
