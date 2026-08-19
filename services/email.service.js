const nodemailer = require("nodemailer");
const { Queue } = require("bullmq");
const logger = require("../config/logger");
const { isAvailable, getClient } = require("../config/redis");

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

const from = process.env.SMTP_FROM || "TaskAPI <no-reply@taskapi.local>";

let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

let queue = null;
const getQueue = () => {
  if (!queue && isAvailable()) {
    queue = new Queue("emails", { connection: getClient() });
  }
  return queue;
};

const sendDirect = async ({ to, subject, body }) => {
  await transporter.sendMail({ from, to, subject, html: body });
};

// Enqueues via BullMQ when Redis is available, sends directly otherwise.
// No-ops (with a log line) when SMTP isn't configured — dev mode.
const sendMail = async ({ to, subject, body }) => {
  if (process.env.NODE_ENV === "test") return;
  if (!transporter) {
    logger.info({ to, subject }, "Email would be sent (SMTP not configured)");
    return;
  }
  if (getQueue()) {
    await getQueue().add(
      "send",
      { to, subject, body },
      { removeOnComplete: 100, removeOnFail: 1000 }
    );
  } else {
    await sendDirect({ to, subject, body });
  }
};

const closeMailQueue = async () => {
  if (queue) {
    try {
      await queue.close();
    } catch (e) {
      logger.warn({ err: e }, "Failed to close email queue");
    }
  }
};

const wrap = (title, text) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color: #333;">${title}</h2>
    <p style="color: #555;">${text}</p>
    <p style="color: #999; font-size: 12px;">Task Management API</p>
  </div>`;

module.exports = { sendMail, closeMailQueue, wrap, sendDirect };
