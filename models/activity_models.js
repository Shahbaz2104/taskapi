const mongoose = require("mongoose");

// Append-only audit trail per task: shares granted/revoked, comments
// added, status changes by collaborators. Never updated or deleted.
const activitySchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      maxlength: 60,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
