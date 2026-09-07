import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

const heartbeatSchema = z.object({
  fullscreen: z.boolean().default(true),
  tabFocused: z.boolean().default(true),
  webcamActive: z.boolean().default(true),
  faceDetected: z.boolean().default(true),
  currentSection: z.number().int().optional(),
  questionId: z.string().optional(),
  timestamp: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: attemptId } = await params;
    const body = heartbeatSchema.parse(await req.json().catch(() => ({})));

    const attempt = await db.attempt.findUnique({
      where: { id: attemptId },
      include: {
        invitation: {
          include: {
            test: {
              include: { sections: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    if (attempt.submittedAt) {
      return NextResponse.json({
        valid: false,
        submitted: true,
        remainingMs: 0,
        serverTime: Date.now(),
        shouldAutoSubmit: false,
      });
    }

    const sections = attempt.invitation.test.sections;
    if (attempt.currentSection >= sections.length) {
      return NextResponse.json({
        valid: false,
        done: true,
        remainingMs: 0,
        serverTime: Date.now(),
        shouldAutoSubmit: true,
      });
    }

    const currentSection = sections[attempt.currentSection];
    const sectionState = (attempt.sectionState ?? {}) as Record<
      string,
      { sectionStartedAt: number; timeLimitSec: number }
    >;
    const currentDurable = sectionState[String(currentSection.order)];

    let remainingMs = currentSection.timeLimitSec * 1000;
    if (currentDurable) {
      const elapsed = Date.now() - currentDurable.sectionStartedAt;
      remainingMs = Math.max(0, currentDurable.timeLimitSec * 1000 - elapsed);
    }

    // Cache heartbeat in Redis for active telemetry
    try {
      const hbKey = `heartbeat:${attemptId}`;
      await redis.set(
        hbKey,
        JSON.stringify({
          ...body,
          serverReceivedAt: Date.now(),
          remainingMs,
        }),
        "EX",
        60,
      );
    } catch {}

    // Auto-log severe anomaly if client lost both fullscreen and tab focus
    if (!body.fullscreen && !body.tabFocused) {
      await db.proctoringEvent.create({
        data: {
          attemptId,
          type: "SUSPICIOUS_HEARTBEAT_DESKTOP_BLUR",
          payload: {
            fullscreen: body.fullscreen,
            tabFocused: body.tabFocused,
            webcamActive: body.webcamActive,
            faceDetected: body.faceDetected,
            recordedAt: new Date().toISOString(),
          },
        },
      });
    }

    const shouldAutoSubmit = remainingMs <= 0;

    return NextResponse.json({
      valid: true,
      remainingMs,
      serverTime: Date.now(),
      shouldAutoSubmit,
      activeSectionIndex: attempt.currentSection,
      totalSections: sections.length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("[POST /api/attempt/[id]/heartbeat] Error:", err);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
