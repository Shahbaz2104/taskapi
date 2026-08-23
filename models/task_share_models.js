const mongoose = require("mongoose");

// Grants a collaborator scoped access to one task. The owner is implicit
// (task.user) and never gets a Share document. Non-members must remain
// indistinguishable from nonexistent tasks — controllers translate a
// failed access lookup into 404, never 403.
const taskShareSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ["viewer", "editor"],
      required: true,
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// One share per user per task
taskShareSchema.index({ task: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("TaskShare", taskShareSchema);
