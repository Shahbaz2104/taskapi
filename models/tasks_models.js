const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => value.length <= 5,
        message: "At most 5 tags per task",
      },
    },
    recurrence: {
      type: String,
      enum: ["daily", "weekly", "monthly", null],
      default: null,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    // Soft delete — set by DELETE /tasks/:id and bulk "trash"; purged
    // permanently after the retention window (jobs/trash_cleanup.js)
    deletedAt: {
      type: Date,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index: scoped reads (list by user, sorted by creation) are the
// hot path — without it Mongo would COLLSCAN every request as data grows.
taskSchema.index({ user: 1, createdAt: -1 });
taskSchema.index({ user: 1, deletedAt: -1 });

// Text index powers ?search= across title and description
taskSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Task", taskSchema);
