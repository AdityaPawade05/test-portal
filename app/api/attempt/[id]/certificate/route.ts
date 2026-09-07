import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { generateCertificatePdf, CertificateData } from "@/lib/pdf-certificate";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: attemptId } = await params;

    const attempt = await db.attempt.findUnique({
      where: { id: attemptId },
      include: {
        score: true,
        events: true,
        invitation: {
          include: {
            test: {
              include: {
                organization: true,
                sections: { orderBy: { order: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!attempt || !attempt.invitation || !attempt.score) {
      return NextResponse.json(
        { error: "Attempt or scorecard not found." },
        { status: 404 },
      );
    }

    const { invitation } = attempt;
    const { test } = invitation;

    // Authorization check
    if (session.user.kind === "admin") {
      if (test.organizationId !== session.user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (session.user.kind === "candidate") {
      if (!session.user.email || invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const score = attempt.score;
    if (!score) {
      return NextResponse.json({ error: "Scorecard not found." }, { status: 404 });
    }

    const rawBySection = (score.rawBySection ?? {}) as Record<string, number>;
    const events = attempt.events;
    const objectViolations = events.filter((e) =>
      [
        "OBJECT_PHONE_DETECTED",
        "PROHIBITED_BOOK_DETECTED",
        "PROHIBITED_SCREEN_DETECTED",
        "PROHIBITED_AUDIO_DEVICE_DETECTED",
        "PROHIBITED_OBJECT_DETECTED",
        "UNAUTHORIZED_PERSON_DETECTED",
      ].includes(e.type),
    ).length;

    let proctoringSeverity: "HIGH RISK" | "MEDIUM" | "CLEAN" = "CLEAN";
    if (objectViolations > 0 || events.length > 3) {
      proctoringSeverity = "HIGH RISK";
    } else if (events.length > 0) {
      proctoringSeverity = "MEDIUM";
    }

    const certData: CertificateData = {
      attemptId: attempt.id,
      testName: test.name,
      organizationName: test.organization?.name || "Assessment Portal",
      candidateName: invitation.candidateName,
      candidateEmail: invitation.email,
      completedAt: attempt.submittedAt || attempt.startedAt || new Date(),
      rawTotal: score.rawTotal,
      percentile: score.percentile,
      passed: score.passed,
      cutoffPercent: test.cutoffPercent,
      sections: test.sections.map((s) => ({
        name: s.name,
        order: s.order,
        timeLimitSec: s.timeLimitSec,
        questionCount: s.questionCount,
        rawScore: s.id in rawBySection ? rawBySection[s.id] : null,
      })),
      proctoringAnomalyCount: events.length,
      proctoringSeverity,
    };

    const pdfBuffer = await generateCertificatePdf(certData);
    const candidateNameClean = (invitation.candidateName || invitation.email).replace(/[^a-zA-Z0-9_-]/g, "_");
    const testNameClean = test.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${testNameClean}_Scorecard_${candidateNameClean}.pdf`;

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Certificate Generation Error]", err);
    return NextResponse.json({ error: "Failed to generate certificate PDF" }, { status: 500 });
  }
}
