const mongoose = require("mongoose");

const webhookSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    // Signing key for HMAC-SHA256 delivery signatures — shown once to
    // the owner on create (it is theirs to store)
    secret: {
      type: String,
      required: true,
    },
    events: {
      type: [String],
      enum: require("../config/constants").WEBHOOK_EVENTS,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Circuit-breaker counter — the webhook is auto-deactivated after
    // WEBHOOK_MAX_CONSECUTIVE_FAILURES consecutive failed deliveries
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Webhook", webhookSchema);
