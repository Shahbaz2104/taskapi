const mongoose = require("mongoose");

const idempotencySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  statusCode: {
    type: Number,
    default: null,
  },
  body: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // TTL — records auto-delete after 24h
  },
});

idempotencySchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("Idempotency", idempotencySchema);
