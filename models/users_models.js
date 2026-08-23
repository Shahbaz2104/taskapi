const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
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
      maxlength: 72, // bcrypt only uses the first 72 bytes
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    // Two-factor authentication — the secret and recovery codes are
    // sensitive, so they stay out of default queries (opt in with
    // .select("+totpSecret +recoveryCodes"))
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
    // iCal feed access token (regenerable) — grants read-only calendar
    // access without a JWT, so it stays out of default queries
    calendarFeedToken: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

// Fast token → user lookup for public feed requests. A partial filter
// (not sparse) is required because the field defaults to null — sparse
// indexes still treat stored nulls as duplicate key material
userSchema.index(
  { calendarFeedToken: 1 },
  {
    unique: true,
    partialFilterExpression: { calendarFeedToken: { $type: "string" } },
  }
);

// ✅ ASYNC STYLE — NO next()
userSchema.pre("save", async function () {
  // Only hash if password is new or modified
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
