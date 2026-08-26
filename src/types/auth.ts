import type { Types } from "mongoose";
import type { Role } from "../config/constants.js";

export interface DecodedAccessToken {
  userId: string;
  purpose?: undefined;
}

export interface ChallengeTokenPayload {
  userId: string;
  purpose: "2fa_challenge";
}

export type SignedJwtPayload = DecodedAccessToken | ChallengeTokenPayload;

export interface RequestUser {
  userId: Types.ObjectId;
  role: Role;
}
