import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Storage Layer for Webcam Snapshots and Proctoring Media
 * Supports AWS S3 if configured, with resilient Base64/data storage fallback.
 */

export interface SnapshotSaveResult {
  url: string;
  storageType: "s3" | "inline";
  key?: string;
}

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const bucket = process.env.S3_PROCTORING_BUCKET || process.env.AWS_S3_BUCKET;

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!bucket) return null;
  if (!s3Client) {
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

export async function saveWebcamSnapshot(
  attemptId: string,
  base64Data: string,
  reason: string = "PERIODIC_SNAPSHOT",
): Promise<SnapshotSaveResult> {
  const client = getS3Client();

  if (client && bucket) {
    try {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const key = `proctoring/${attemptId}/${Date.now()}_${reason.toLowerCase()}.jpg`;

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: "image/jpeg",
        }),
      );

      const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      return { url, storageType: "s3", key };
    } catch (err) {
      console.warn("[Storage] S3 upload failed, using inline data storage:", err);
    }
  }

  // Resilient Inline Data URL Storage (Zero configuration needed)
  const normalizedDataUrl = base64Data.startsWith("data:")
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  return {
    url: normalizedDataUrl,
    storageType: "inline",
  };
}
