import { z } from "zod";

/** Mirrors backend validation (users model: username ≥3, password ≥6). */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(30, "At most 30 characters");

export const passwordSchema = z.string().min(6, "At least 6 characters");

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.email("Enter a valid email"),
  password: passwordSchema,
});

export const forgotSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotInput = z.infer<typeof forgotSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
