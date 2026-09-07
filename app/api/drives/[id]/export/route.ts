import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  generatePlacementDriveExcel,
  type ExportDriveCandidate,
} from "@/lib/export-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: driveId } = await params;
    const session = await auth();
    const url = new URL(req.url);
    const passkey = url.searchParams.get("passkey");

    const drive = await db.placementDrive.findUnique({
      where: { id: driveId },
      include: {
        organization: { select: { id: true, name: true } },
        candidates: {
          include: {
            invitation: {
              include: {
                attempt: {
                  include: {
                    score: true,
                    events: true,
                  },
                },
              },
            },
          },
          orderBy: [{ shortlistDecision: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    const isAdmin =
      session?.user?.kind === "admin" &&
      session.user.organizationId === drive.organizationId;
    const isAuthorizedRecruiter =
      Boolean(passkey) && drive.accessPasscode === passkey;

    if (!isAdmin && !isAuthorizedRecruiter) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exportCandidates: ExportDriveCandidate[] = drive.candidates.map((c) => {
      const attempt = c.invitation?.attempt;
      const score = attempt?.score;
      const events = attempt?.events ?? [];

      const tabBlurs = events.filter((e) => e.type === "TAB_BLUR").length;
      const objectFlags = events.filter((e) =>
        [
          "OBJECT_PHONE_DETECTED",
          "PROHIBITED_BOOK_DETECTED",
          "PROHIBITED_SCREEN_DETECTED",
          "PROHIBITED_AUDIO_DEVICE_DETECTED",
          "UNAUTHORIZED_PERSON_DETECTED",
        ].includes(e.type),
      ).length;

      let integrityRisk = "CLEAN";
      if (objectFlags > 0 || events.length > 5) {
        integrityRisk = "HIGH RISK";
      } else if (events.length > 0) {
        integrityRisk = "MEDIUM";
      }

      const passedLabel =
        score?.passed === true ? "Passed" : score?.passed === false ? "Failed" : "—";

      let status = "Not Invited";
      if (c.invitation?.status === "SUBMITTED" || attempt?.submittedAt) {
        status = "Completed";
      } else if (c.invitation?.status === "STARTED") {
        status = "In Progress";
      } else if (c.invitation) {
        status = "Invited";
      }

      return {
        rollNumber: c.rollNumber,
        name: c.name,
        email: c.email,
        branch: c.branch,
        cgpa: c.cgpa,
        passingYear: c.passingYear,
        labSlot: c.labSlot,
        shortlistDecision: c.shortlistDecision,
        recruiterNotes: c.recruiterNotes,
        status,
        totalScore: score ? score.rawTotal : "—",
        percentile: score?.percentile != null ? `${score.percentile}%` : "—",
        passed: passedLabel,
        integrityRisk,
        tabBlurs,
        objectFlags,
        violationsCount: events.length,
      };
    });

    const excelBuffer = await generatePlacementDriveExcel({
      companyName: drive.companyName,
      jobRole: drive.jobRole,
      ctcPackage: drive.ctcPackage,
      driveDate: drive.driveDate,
      collegeName: drive.organization.name,
      candidates: exportCandidates,
    });

    const safeCompanyName = drive.companyName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeCompanyName}_Placement_Shortlist.xlsx`;

    return new Response(Buffer.from(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Error exporting drive:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
