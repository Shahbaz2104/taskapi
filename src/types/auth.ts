import type { Types } from "mongoose";
import type { Role } from "../config/constants.js";

export interface DecodedAccessToken {
  userId: string;
  purpose: "access";
}

export interface ChallengeTokenPayload {
  userId: string;
  purpose: "2fa_challenge";
}

export interface PasswordResetPayload {
  userId: string;
  purpose: "password_reset";
}

export interface EmailVerifyPayload {
  email: string;
  purpose: "email_verify";
}

export type SignedJwtPayload =
  | DecodedAccessToken
  | ChallengeTokenPayload
  | PasswordResetPayload
  | EmailVerifyPayload;

export interface RequestUser {
  userId: Types.ObjectId;
  role: Role;
}
