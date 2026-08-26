import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { protect } from "../middleware/auth.js";
import { authorize } from "../middleware/rbac.js";
import { zodValidate } from "../middleware/zod.js";
import { roleUpdateSchema } from "../schemas/admin.js";
import { userIdParamSchema } from "../schemas/params.js";

const router = Router();

router.use(protect, authorize("admin"));

router.get("/users", adminController.listUsers);
router.patch(
  "/users/:id",
  zodValidate(userIdParamSchema, "params"),
  zodValidate(roleUpdateSchema),
  adminController.updateUserRole
);
router.delete(
  "/users/:id",
  zodValidate(userIdParamSchema, "params"),
  adminController.deleteUser
);

export default router;
