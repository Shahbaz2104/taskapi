import bcrypt from "bcryptjs";
import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import type { HydratedDocument } from "mongoose";
import type { Role } from "../config/constants.js";

interface UserMethods {
  comparePassword(enteredPassword: string): Promise<boolean>;
}

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      maxlength: 72,
    },
    role: {
      type: String,
      enum: ["admin", "user"] as readonly Role[],
      default: "user",
    },
    totpSecret: {
      type: String,
      default: null,
      select: false,
    },
    totpEnabled: {
      type: Boolean,
      default: false,
    },
    recoveryCodes: {
      type: [
        {
          codeHash: { type: String, required: true },
          usedAt: { type: Date, default: null },
        },
      ],
      default: [],
      select: false,
    },
    calendarFeedToken: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

export type UserAttrs = InferSchemaType<typeof userSchema>;

export type UserDocument = HydratedDocument<UserAttrs, UserMethods>;

export type UserModel = Model<UserAttrs, Record<string, never>, UserMethods>;

userSchema.index(
  { calendarFeedToken: 1 },
  {
    unique: true,
    partialFilterExpression: { calendarFeedToken: { $type: "string" } },
  }
);

userSchema.pre("save", async function (): Promise<void> {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (
  this: UserDocument,
  enteredPassword: string
): Promise<boolean> {
  return bcrypt.compare(enteredPassword, this.password);
};

export const User = model<UserAttrs, UserModel>("User", userSchema);
