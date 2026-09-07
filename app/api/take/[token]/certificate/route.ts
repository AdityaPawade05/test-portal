import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCertificatePdf, CertificateData } from "@/lib/pdf-certificate";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        test: {
          include: {
            organization: true,
            sections: { orderBy: { order: "asc" } },
          },
        },
        attempt: {
          include: {
            score: true,
            events: true,
          },
        },
      },
    });

    if (!invitation || !invitation.attempt || !invitation.attempt.score) {
      return NextResponse.json(
        { error: "Assessment has not been completed or submitted yet." },
        { status: 404 },
      );
    }

    const { test, attempt } = invitation;
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
    const sanitizedName = test.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${sanitizedName}_Scorecard_Certificate.pdf`;

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
