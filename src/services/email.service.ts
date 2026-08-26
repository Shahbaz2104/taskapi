import { Queue } from "bullmq";
import { createTransport, type Transporter } from "nodemailer";
import logger from "../config/logger.js";
import { getClient, isAvailable } from "../config/redis.js";
import { env } from "../config/env.js";
import { QUEUES } from "../config/constants.js";

export interface EmailJobPayload {
  to: string;
  subject: string;
  body: string;
}

const FROM = env.SMTP_FROM || "TaskAPI <no-reply@taskapi.local>";

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
};

let queue: Queue<EmailJobPayload> | null = null;

const getQueue = (): Queue<EmailJobPayload> | null => {
  if (!queue && isAvailable()) {
    queue = new Queue<EmailJobPayload>(QUEUES.EMAILS, {
      connection: getClient() as never,
    });
  }
  return queue;
};

const sendDirect = async ({
  to,
  subject,
  body,
}: EmailJobPayload): Promise<void> => {
  const transport = getTransporter();
  if (!transport) return;
  await transport.sendMail({ from: FROM, to, subject, html: body });
};

const sendMail = async ({
  to,
  subject,
  body,
}: EmailJobPayload): Promise<void> => {
  if (env.NODE_ENV === "test") return;
  if (!getTransporter()) {
    logger.info({ to, subject }, "Email would be sent (SMTP not configured)");
    return;
  }
  const mailQueue = getQueue();
  if (mailQueue) {
    await mailQueue.add(
      "send",
      { to, subject, body },
      {
        removeOnComplete: 100,
        removeOnFail: 1000,
      }
    );
  } else {
    await sendDirect({ to, subject, body });
  }
};

const closeMailQueue = async (): Promise<void> => {
  if (queue) {
    try {
      await queue.close();
    } catch (e) {
      logger.warn({ err: e }, "Failed to close email queue");
    }
  }
};

const wrap = (title: string, text: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color: #333;">${title}</h2>
    <p style="color: #555;">${text}</p>
    <p style="color: #999; font-size: 12px;">Task Management API</p>
  </div>`;

export { sendMail, closeMailQueue, wrap, sendDirect };
