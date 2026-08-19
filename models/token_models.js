const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["refresh"],
      default: "refresh",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

tokenSchema.index({ user: 1 });

module.exports = mongoose.model("Token", tokenSchema);
