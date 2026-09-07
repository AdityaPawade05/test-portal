import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import {
  generateTestResultsExcel,
  generateTestResultsCsv,
  generateProctoringAuditCsv,
  ExportTestData,
} from "@/lib/export-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const type = (searchParams.get("type") || "all").toLowerCase();

    const test = await db.test.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        sections: { orderBy: { order: "asc" } },
        invitations: {
          orderBy: { createdAt: "desc" },
          include: {
            attempt: {
              include: {
                score: true,
                events: { orderBy: { occurredAt: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!test) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const testData: ExportTestData = {
      id: test.id,
      name: test.name,
      cutoffPercent: test.cutoffPercent,
      sections: test.sections.map((s) => ({
        id: s.id,
        name: s.name,
        order: s.order,
        timeLimitSec: s.timeLimitSec,
        questionCount: s.questionCount,
      })),
      invitations: test.invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        candidateName: inv.candidateName,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        attempt: inv.attempt
          ? {
              id: inv.attempt.id,
              startedAt: inv.attempt.startedAt,
              submittedAt: inv.attempt.submittedAt,
              score: inv.attempt.score
                ? {
                    rawTotal: inv.attempt.score.rawTotal,
                    rawBySection: inv.attempt.score.rawBySection,
                    percentile: inv.attempt.score.percentile,
                    passed: inv.attempt.score.passed,
                  }
                : null,
              events: inv.attempt.events.map((e) => ({
                id: e.id,
                type: e.type,
                payload: e.payload,
                occurredAt: e.occurredAt,
              })),
            }
          : null,
      })),
    };

    const dateStamp = new Date().toISOString().split("T")[0];
    const sanitizedName = test.name.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (format === "csv") {
      let csvContent = "";
      let filename = "";

      if (type === "proctoring") {
        csvContent = generateProctoringAuditCsv(testData);
        filename = `${sanitizedName}_Proctoring_Audit_${dateStamp}.csv`;
      } else {
        csvContent = generateTestResultsCsv(testData);
        filename = `${sanitizedName}_Candidate_Scores_${dateStamp}.csv`;
      }

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Default: Excel (.xlsx)
    const excelBuffer = await generateTestResultsExcel(testData);
    const filename = `${sanitizedName}_Comprehensive_Results_${dateStamp}.xlsx`;

    return new Response(excelBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("[Export Error]", err);
    return NextResponse.json({ error: "Failed to generate export file" }, { status: 500 });
  }
}
