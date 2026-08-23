const { Worker, Queue } = require("bullmq");
const Task = require("../models/tasks_models.js");
const { getClient, isAvailable } = require("../config/redis");
const { sendMail } = require("../services/email.service.js");
const logger = require("../config/logger");

const REMINDER_CRON = "0 * * * *"; // hourly
const LOOKAHEAD_HOURS = 24;

const checkReminders = async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const due = await Task.find({
    dueDate: { $gte: now, $lte: horizon },
    status: { $ne: "completed" },
    reminderSent: false,
    deletedAt: null, // never remind about trashed tasks
  })
    .populate("user")
    .lean();

  for (const task of due) {
    const user = task.user;
    if (!user || !user.email) continue;
    await sendMail({
      to: user.email,
      subject: `Reminder: ${task.title}`,
      body: `Task "<strong>${task.title}</strong>" is due ${new Date(task.dueDate).toISOString()}.`,
    });
    await Task.updateOne({ _id: task._id }, { $set: { reminderSent: true } });
  }

  if (due.length > 0)
    logger.info({ count: due.length }, "Reminders dispatched");
  return due.length;
};

let reminderWorker = null;

const startReminderJob = () => {
  if (!isAvailable() || reminderWorker) return;

  const queue = new Queue("reminders", { connection: getClient() });
  queue
    .add(
      "hourly",
      {},
      { repeat: { pattern: REMINDER_CRON }, jobId: "hourly-reminders" }
    )
    .catch((err) => logger.warn({ err }, "Failed to schedule reminders"));

  reminderWorker = new Worker(
    "reminders",
    async () => {
      await checkReminders();
    },
    { connection: getClient() }
  );
  logger.info("Reminder job started");
};

module.exports = { startReminderJob, checkReminders };
