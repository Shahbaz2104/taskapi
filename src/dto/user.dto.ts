import type { Role } from "../config/constants.js";

export interface UserLike {
  _id: unknown;
  username: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  totpEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface PublicUser {
  _id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export const toPublicUser = (user: UserLike): PublicUser => {
  const {
    _id,
    username,
    email,
    emailVerified,
    role,
    totpEnabled,
    createdAt,
    updatedAt,
    __v,
  } = user;
  return {
    _id: String(_id),
    username,
    email,
    emailVerified,
    role,
    totpEnabled,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...(__v !== undefined ? { __v } : {}),
  };
};
