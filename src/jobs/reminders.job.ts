import { Queue, Worker } from "bullmq";
import type { Types } from "mongoose";
import { Task, type TaskAttrs } from "../models/task.js";
import { getClient, isAvailable } from "../config/redis.js";
import { sendMail } from "../services/email.service.js";
import logger from "../config/logger.js";
import { QUEUES } from "../config/constants.js";

const REMINDER_CRON = "0 * * * *"; // hourly
const LOOKAHEAD_HOURS = 24;

interface LeanTaskWithUser extends Omit<TaskAttrs, "user"> {
  _id: Types.ObjectId;
  user: { _id: Types.ObjectId; email?: string } | null;
}

const checkReminders = async (): Promise<number> => {
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const due = (await Task.find({
    dueDate: { $gte: now, $lte: horizon },
    status: { $ne: "completed" },
    reminderSent: false,
    deletedAt: null,
  })
    .populate("user")
    .lean()) as unknown as LeanTaskWithUser[];

  for (const task of due) {
    const user = task.user;
    if (!user || !user.email) continue;
    await sendMail({
      to: user.email,
      subject: `Reminder: ${task.title}`,
      body: `Task "<strong>${task.title}</strong>" is due ${new Date(task.dueDate ?? now).toISOString()}.`,
    });
    await Task.updateOne({ _id: task._id }, { $set: { reminderSent: true } });
  }

  if (due.length > 0)
    logger.info({ count: due.length }, "Reminders dispatched");
  return due.length;
};

let reminderWorker: Worker | null = null;

const startReminderJob = (): void => {
  if (!isAvailable() || reminderWorker) return;

  const queue = new Queue(QUEUES.REMINDERS, {
    connection: getClient() as never,
  });
  queue
    .add("hourly", {}, {
      repeat: { pattern: REMINDER_CRON },
      jobId: "hourly-reminders",
    } as never)
    .catch((err) => logger.warn({ err }, "Failed to schedule reminders"));

  reminderWorker = new Worker(
    QUEUES.REMINDERS,
    async () => {
      await checkReminders();
    },
    { connection: getClient() as never }
  );
  logger.info("Reminder job started");
};

export { startReminderJob, checkReminders };
