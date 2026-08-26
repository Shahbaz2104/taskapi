import { z } from "zod";

export const roleUpdateSchema = z.object({
  role: z.enum(["admin", "user"], {
    message: "Role must be admin or user",
  }),
});
