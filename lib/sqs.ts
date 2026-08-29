import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export type ScoreAttemptJob = {
  type: "SCORE_ATTEMPT";
  attemptId: string;
};

export type SendInviteEmailJob = {
  type: "SEND_INVITE_EMAIL";
  to: string;
  testName: string;
  link: string;
  expiresAt: string; // ISO string
  customNote?: string;
  organizationName: string;
  timeLimitSec: number;
  candidateName?: string | null;
};

export type BulkInviteJob = {
  type: "BULK_INVITE";
  invitations: Omit<SendInviteEmailJob, "type">[];
};

export type SqsJob = ScoreAttemptJob | SendInviteEmailJob | BulkInviteJob;

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const queueUrl = process.env.SQS_QUEUE_URL;

let sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient | null {
  if (!queueUrl) return null;
  if (!sqsClient) {
    sqsClient = new SQSClient({ region });
  }
  return sqsClient;
}

export function isSqsEnabled(): boolean {
  return Boolean(queueUrl);
}

export async function enqueueJob(job: SqsJob): Promise<boolean> {
  const client = getSqsClient();
  if (!client || !queueUrl) {
    return false;
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(job),
    });
    await client.send(command);
    return true;
  } catch (error) {
    console.error("[SQS Enqueue Error]", error);
    return false;
  }
}
