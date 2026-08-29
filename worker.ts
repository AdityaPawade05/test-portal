import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from "@aws-sdk/client-sqs";
import { computeScore } from "./lib/scoring";
import { sendInvitationEmail } from "./lib/mailer";
import type { SqsJob, SendInviteEmailJob } from "./lib/sqs";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const queueUrl = process.env.SQS_QUEUE_URL;

if (!queueUrl) {
  console.error("FATAL: SQS_QUEUE_URL environment variable is not defined. Exiting worker.");
  process.exit(1);
}

const sqsClient = new SQSClient({ region });
let isShuttingDown = false;

/** Send up to `limit` emails concurrently from the given list. */
async function sendConcurrent(
  invitations: Omit<SendInviteEmailJob, "type">[],
  concurrency = 5,
): Promise<void> {
  const queue = [...invitations];
  let active = 0;
  let index = 0;

  await new Promise<void>((resolve, reject) => {
    function next() {
      if (index >= queue.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && index < queue.length) {
        const invite = queue[index++];
        active++;
        sendInvitationEmail({
          to: invite.to,
          testName: invite.testName,
          link: invite.link,
          expiresAt: new Date(invite.expiresAt),
          customNote: invite.customNote,
          organizationName: invite.organizationName,
          timeLimitSec: invite.timeLimitSec,
          candidateName: invite.candidateName,
        })
          .then((result) => {
            if (result.success) {
              console.log(`[Worker] ✓ Email sent to ${invite.to}`);
            } else {
              console.warn(`[Worker] ✗ Failed to send email to ${invite.to}: ${result.error}`);
            }
          })
          .catch((err) => {
            console.error(`[Worker] ✗ Error sending to ${invite.to}:`, err);
          })
          .finally(() => {
            active--;
            next();
          });
      }
    }
    next();
    // Propagate unexpected errors
    void reject; // suppress unused lint warning — resolve/reject held in closure
  });
}

async function processJob(job: SqsJob): Promise<void> {
  switch (job.type) {
    case "SCORE_ATTEMPT": {
      console.log(`[Worker] Processing SCORE_ATTEMPT for attemptId: ${job.attemptId}`);
      await computeScore(job.attemptId);
      console.log(`[Worker] Successfully scored attemptId: ${job.attemptId}`);
      break;
    }
    case "SEND_INVITE_EMAIL": {
      console.log(`[Worker] Sending invitation email to: ${job.to}`);
      const result = await sendInvitationEmail({
        to: job.to,
        testName: job.testName,
        link: job.link,
        expiresAt: new Date(job.expiresAt),
        customNote: job.customNote,
        organizationName: job.organizationName,
        timeLimitSec: job.timeLimitSec,
        candidateName: job.candidateName,
      });
      if (result.success) {
        console.log(`[Worker] Invitation email sent to: ${job.to}`);
      } else {
        console.warn(`[Worker] Failed to send invitation email to ${job.to}: ${result.error}`);
      }
      break;
    }
    case "BULK_INVITE": {
      const total = job.invitations.length;
      console.log(`[Worker] Processing BULK_INVITE job with ${total} invitation(s) (concurrency: 5)`);
      await sendConcurrent(job.invitations, 5);
      console.log(`[Worker] BULK_INVITE batch complete (${total} processed)`);
      break;
    }
    default: {
      console.warn(`[Worker] Unknown job type: ${(job as { type: string }).type}`);
    }
  }
}

async function handleMessage(message: Message): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) return;

  try {
    const job: SqsJob = JSON.parse(message.Body);
    await processJob(job);

    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  } catch (error) {
    console.error("[Worker] Error processing message:", error);
    // Message remains in SQS and will return to queue after visibility timeout, eventually moving to DLQ
  }
}

async function pollLoop(): Promise<void> {
  console.log(`[Worker] Background SQS worker started. Polling ${queueUrl}...`);

  while (!isShuttingDown) {
    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 20,
          AttributeNames: ["All"],
        }),
      );

      if (response.Messages && response.Messages.length > 0) {
        console.log(`[Worker] Received ${response.Messages.length} message(s) from SQS`);
        await Promise.all(response.Messages.map(handleMessage));
      }
    } catch (error) {
      if (isShuttingDown) break;
      console.error("[Worker] Error polling SQS:", error);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }

  console.log("[Worker] Polling loop stopped cleanly.");
}

function handleShutdown(signal: string) {
  console.log(`[Worker] Received ${signal}. Initiating graceful shutdown...`);
  isShuttingDown = true;
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

pollLoop().catch((err) => {
  console.error("[Worker] Fatal error in poll loop:", err);
  process.exit(1);
});
