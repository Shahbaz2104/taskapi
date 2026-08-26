import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import * as webhooksController from "../controllers/webhooks.controller.js";
import * as collabController from "../controllers/collab.controller.js";
import { protect } from "../middleware/auth.js";
import { zodValidate } from "../middleware/zod.js";
import {
  updateMeSchema,
  changePasswordSchema,
  enable2faSchema,
  disable2faSchema,
} from "../schemas/account.js";
import { taskIdParamSchema, sessionIdParamSchema } from "../schemas/params.js";
import {
  createWebhookSchema,
  updateWebhookSchema,
} from "../schemas/webhooks.js";

const router = Router();

router.use(protect);

router.get("/", userController.getMe);
router.patch("/", zodValidate(updateMeSchema), userController.updateMe);
router.put(
  "/password",
  zodValidate(changePasswordSchema),
  userController.changePassword
);
router.post("/2fa/setup", userController.setup2fa);
router.post(
  "/2fa/enable",
  zodValidate(enable2faSchema),
  userController.enable2fa
);
router.post(
  "/2fa/disable",
  zodValidate(disable2faSchema),
  userController.disable2fa
);
router.get("/sessions", userController.listSessions);
router.get("/shared", collabController.listSharedForMe);
router.delete(
  "/sessions/:sessionId",
  zodValidate(sessionIdParamSchema, "params"),
  userController.revokeSession
);
router.get("/calendar-feed", userController.getCalendarFeedSettings);
router.post("/calendar-feed/rotate", userController.rotateCalendarFeedToken);
router.get("/webhooks", webhooksController.listWebhooks);
router.post(
  "/webhooks",
  zodValidate(createWebhookSchema),
  webhooksController.createWebhook
);
router.patch(
  "/webhooks/:id",
  zodValidate(taskIdParamSchema, "params"),
  zodValidate(updateWebhookSchema),
  webhooksController.updateWebhook
);
router.delete(
  "/webhooks/:id",
  zodValidate(taskIdParamSchema, "params"),
  webhooksController.deleteWebhook
);
router.post(
  "/webhooks/:id/ping",
  zodValidate(taskIdParamSchema, "params"),
  webhooksController.pingWebhook
);
router.delete("/", userController.deleteMe);

export default router;
