import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { saveWebcamSnapshot } from "@/lib/storage";

const snapshotSchema = z.object({
  image: z.string().min(1, "Snapshot image data is required"),
  reason: z.string().default("PERIODIC_SNAPSHOT"),
  metadata: z.record(z.string(), z.any()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: attemptId } = await params;
    const body = snapshotSchema.parse(await req.json());

    const attempt = await db.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, submittedAt: true },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.submittedAt) {
      return NextResponse.json(
        { error: "Attempt has already been submitted" },
        { status: 400 },
      );
    }

    // Save snapshot via storage layer (S3 or Inline)
    const result = await saveWebcamSnapshot(attemptId, body.image, body.reason);

    const payloadData = {
      imageUrl: result.url,
      reason: body.reason,
      storageType: result.storageType,
      key: result.key ?? null,
      metadata: body.metadata ?? null,
      capturedAt: new Date().toISOString(),
    };

    // Save proctoring event
    const event = await db.proctoringEvent.create({
      data: {
        attemptId,
        type: "WEBCAM_SNAPSHOT",
        payload: JSON.parse(JSON.stringify(payloadData)),
      },
    });

    return NextResponse.json({
      success: true,
      eventId: event.id,
      imageUrl: result.url,
      storageType: result.storageType,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("[POST /api/attempt/[id]/snapshot] Error:", err);
    return NextResponse.json(
      { error: "Failed to store webcam snapshot" },
      { status: 500 },
    );
  }
}
