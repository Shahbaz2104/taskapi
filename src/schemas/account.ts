import { z } from "zod";

const usernameField = z
  .string()
  .trim()
  .min(3, "Username must be between 3 and 30 characters")
  .max(30, "Username must be between 3 and 30 characters");

const emailField = z
  .string()
  .trim()
  .email("Invalid email address")
  .transform((v) => v.toLowerCase());

export const updateMeSchema = z
  .object({
    username: usernameField.optional(),
    email: emailField.optional(),
  })
  .refine((v) => v.username !== undefined || v.email !== undefined, {
    message: "At least one field is required",
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be between 6 and 72 characters")
    .max(72, "Password must be between 6 and 72 characters"),
});

export const enable2faSchema = z.object({
  token: z
    .string()
    .trim()
    .min(6, "A 6-digit authenticator code is required")
    .max(6, "A 6-digit authenticator code is required"),
});

export const disable2faSchema = z
  .object({
    password: z.string().min(1, "Password is required"),
    code: z.string().optional(),
    recoveryCode: z.string().optional(),
  })
  .refine((v) => Boolean(v.code || v.recoveryCode), {
    message:
      "An authenticator code or recovery code is required to disable 2FA",
  });
