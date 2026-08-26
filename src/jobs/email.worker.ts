import { Worker } from "bullmq";
import { sendDirect, type EmailJobPayload } from "../services/email.service.js";
import { getClient, isAvailable } from "../config/redis.js";
import { reportError } from "../config/sentry.js";
import logger from "../config/logger.js";
import { QUEUES } from "../config/constants.js";

let worker: Worker<EmailJobPayload> | null = null;

const startEmailWorker = (): void => {
  if (!isAvailable() || worker) return;
  worker = new Worker<EmailJobPayload>(
    QUEUES.EMAILS,
    async (job) => {
      await sendDirect(job.data);
    },
    { connection: getClient() as never }
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Email job failed");
    reportError(err, { queue: QUEUES.EMAILS, jobId: job?.id });
  });
  logger.info("Email worker started");
};

export { startEmailWorker };
