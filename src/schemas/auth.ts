import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .min(3, "Username must be between 3 and 30 characters")
    .max(30, "Username must be between 3 and 30 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be between 6 and 72 characters")
    .max(72, "Password must be between 6 and 72 characters"),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be between 6 and 72 characters")
    .max(72, "Password must be between 6 and 72 characters"),
});

export const challenge2faSchema = z
  .object({
    challengeToken: z.string().min(1, "Challenge token is required"),
    code: z.string().optional(),
    recoveryCode: z.string().optional(),
  })
  .refine((v) => Boolean(v.code || v.recoveryCode), {
    message: "An authenticator code or recovery code is required",
  });
