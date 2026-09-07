import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { parseCsv, rowsToRecords } from "@/lib/bulk-import";
import { sendInvitationEmail } from "@/lib/mailer";
import { getAppBaseUrl } from "@/lib/utils";

const singleCandidateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  rollNumber: z.string().min(1, "Roll Number / PRN is required"),
  branch: z.string().min(1, "Branch is required"),
  cgpa: z.number().min(0).max(10).nullish(),
  passingYear: z.number().int().nullish(),
  labSlot: z.string().nullish(),
  customNote: z.string().optional(),
  sendEmail: z.boolean().optional().default(false),
  expiresInHours: z.number().positive().optional(),
  expiresInDays: z.number().positive().optional(),
});

const bulkCandidateSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Valid email required"),
      rollNumber: z.string().min(1, "Roll Number / PRN is required"),
      branch: z.string().min(1, "Branch is required"),
      cgpa: z.number().min(0).max(10).nullish(),
      passingYear: z.number().int().nullish(),
      labSlot: z.string().nullish(),
    }),
  ),
  autoCreateInvitations: z.boolean().default(true),
  sendEmail: z.boolean().optional().default(false),
  customNote: z.string().optional(),
  expiresInHours: z.number().positive().optional(),
  expiresInDays: z.number().positive().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: driveId } = await params;
    const user = await requireAdminSession();
    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    const drive = await db.placementDrive.findUnique({
      where: { id: driveId, organizationId: user.organizationId },
    });
    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    const candidates = await db.driveCandidate.findMany({
      where: { driveId },
      include: {
        invitation: {
          include: {
            attempt: {
              include: {
                score: true,
                events: { select: { id: true, type: true } },
              },
            },
          },
        },
      },
      orderBy: [{ shortlistDecision: "asc" }, { name: "asc" }],
    });

    const enriched = candidates.map((c) => {
      const isEligibleCgpa =
        drive.eligibilityMinCgpa == null ||
        (c.cgpa != null && c.cgpa >= drive.eligibilityMinCgpa);
      const isEligibleBranch =
        drive.eligibleBranches.length === 0 ||
        drive.eligibleBranches.some(
          (b) => b.toLowerCase() === c.branch.toLowerCase(),
        );

      const attempt = c.invitation?.attempt;
      const score = attempt?.score;
      const violationCount = attempt?.events?.length || 0;

      return {
        ...c,
        isEligible: isEligibleCgpa && isEligibleBranch,
        eligibilityWarnings: [
          ...(!isEligibleCgpa
            ? [`CGPA (${c.cgpa}) below cutoff (${drive.eligibilityMinCgpa})`]
            : []),
          ...(!isEligibleBranch
            ? [`Branch (${c.branch}) not in eligible list`]
            : []),
        ],
        testStatus: c.invitation?.status || "NOT_INVITED",
        token: c.invitation?.token || null,
        takeUrl: c.invitation?.token ? `${baseUrl}/take/${c.invitation.token}` : null,
        invitationExpiresAt: c.invitation?.expiresAt || null,
        invitationCreatedAt: c.invitation?.createdAt || null,
        score: score
          ? {
              total: score.rawTotal,
              percentile: score.percentile,
              passed: score.passed,
              breakdown: score.rawBySection,
            }
          : null,
        violations: violationCount,
      };
    });

    return NextResponse.json({ candidates: enriched, drive });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("Error fetching drive candidates:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: driveId } = await params;
    const user = await requireAdminSession();
    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    const drive = await db.placementDrive.findUnique({
      where: { id: driveId, organizationId: user.organizationId },
      include: {
        organization: { select: { name: true } },
        test: {
          include: {
            sections: { select: { timeLimitSec: true } },
          },
        },
      },
    });
    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    let candidatesList: Array<{
      name: string;
      email: string;
      rollNumber: string;
      branch: string;
      cgpa?: number | null;
      passingYear?: number | null;
      labSlot?: string | null;
    }> = [];
    let autoCreateInvitations = true;
    let shouldSendEmail = false;
    let customNote: string | undefined;
    let expiresInHours: number | undefined;
    let expiresInDays: number | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
      }
      const rawRecords = rowsToRecords(parseCsv(await file.text()));
      if (rawRecords.length === 0) {
        return NextResponse.json({ error: "No data rows in CSV file" }, { status: 400 });
      }

      for (const r of rawRecords) {
        const name = (r.name || r.candidateName || r.fullName || "").trim();
        const email = (r.email || "").trim();
        const rollNumber = (r.rollNumber || r.rollNo || r.prn || r.usn || "").trim();
        const branch = (r.branch || r.department || "").trim();
        const cgpaVal = r.cgpa ? parseFloat(String(r.cgpa)) : null;
        const passingYearVal = r.passingYear ? parseInt(String(r.passingYear), 10) : null;
        const labSlot = (r.labSlot || r.slot || r.lab || "").trim() || null;

        if (email && (name || rollNumber)) {
          candidatesList.push({
            name: name || rollNumber,
            email,
            rollNumber: rollNumber || email.split("@")[0],
            branch: branch || "General",
            cgpa: isNaN(cgpaVal!) ? null : cgpaVal,
            passingYear: isNaN(passingYearVal!) ? null : passingYearVal,
            labSlot,
          });
        }
      }
    } else {
      const rawBody = await req.json();
      // Check if single candidate object vs bulk
      if (rawBody && Array.isArray(rawBody.candidates)) {
        const parsed = bulkCandidateSchema.parse(rawBody);
        candidatesList = parsed.candidates;
        autoCreateInvitations = parsed.autoCreateInvitations;
        shouldSendEmail = Boolean(parsed.sendEmail);
        customNote = parsed.customNote;
        expiresInHours = parsed.expiresInHours;
        expiresInDays = parsed.expiresInDays;
      } else {
        const singleParsed = singleCandidateSchema.parse(rawBody);
        candidatesList = [
          {
            name: singleParsed.name,
            email: singleParsed.email,
            rollNumber: singleParsed.rollNumber,
            branch: singleParsed.branch,
            cgpa: singleParsed.cgpa,
            passingYear: singleParsed.passingYear,
            labSlot: singleParsed.labSlot,
          },
        ];
        autoCreateInvitations = true;
        shouldSendEmail = Boolean(singleParsed.sendEmail);
        customNote = singleParsed.customNote;
        expiresInHours = singleParsed.expiresInHours;
        expiresInDays = singleParsed.expiresInDays;
      }
    }

    if (candidatesList.length === 0) {
      return NextResponse.json(
        { error: "No valid candidates provided" },
        { status: 400 },
      );
    }

    const expiryMs = expiresInHours
      ? expiresInHours * 60 * 60 * 1000
      : expiresInDays
        ? expiresInDays * 24 * 60 * 60 * 1000
        : 14 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiryMs);

    // Upsert candidates and generate invitations transactionally
    const processedCandidates = await db.$transaction(async (tx) => {
      const results = [];

      for (const item of candidatesList) {
        let candidate = await tx.driveCandidate.findFirst({
          where: { driveId, email: item.email },
        });

        if (!candidate) {
          candidate = await tx.driveCandidate.create({
            data: {
              driveId,
              name: item.name,
              email: item.email,
              rollNumber: item.rollNumber,
              branch: item.branch,
              cgpa: item.cgpa,
              passingYear: item.passingYear,
              labSlot: item.labSlot,
            },
          });
        } else {
          candidate = await tx.driveCandidate.update({
            where: { id: candidate.id },
            data: {
              name: item.name,
              rollNumber: item.rollNumber,
              branch: item.branch,
              cgpa: item.cgpa,
              passingYear: item.passingYear,
              labSlot: item.labSlot,
            },
          });
        }

        // Create Invitation if drive has a test
        let invitation = null;
        if (autoCreateInvitations && drive.testId) {
          if (!candidate.invitationId) {
            invitation = await tx.invitation.create({
              data: {
                testId: drive.testId,
                email: candidate.email,
                candidateName: candidate.name,
                token: randomUUID(),
                expiresAt,
              },
            });

            candidate = await tx.driveCandidate.update({
              where: { id: candidate.id },
              data: { invitationId: invitation.id },
            });
          } else {
            invitation = await tx.invitation.findUnique({
              where: { id: candidate.invitationId },
            });
          }
        }

        results.push({ ...candidate, invitation });
      }

      return results;
    });

    let emailSentCount = 0;
    // If sendEmail was requested and test exists
    if (shouldSendEmail && drive.test && drive.test.published) {
      const totalTimeLimitSec = drive.test.sections.reduce(
        (acc, s) => acc + s.timeLimitSec,
        0,
      );

      const emailPromises = processedCandidates
        .filter((c) => c.invitation)
        .map(async (c) => {
          const res = await sendInvitationEmail({
            to: c.email,
            testName: drive.test!.name,
            link: `${baseUrl}/take/${c.invitation!.token}`,
            expiresAt: c.invitation!.expiresAt,
            customNote,
            organizationName: drive.organization.name,
            timeLimitSec: totalTimeLimitSec,
            candidateName: c.name,
            companyName: drive.companyName,
            jobRole: drive.jobRole,
            ctcPackage: drive.ctcPackage,
            labSlot: c.labSlot,
            rollNumber: c.rollNumber,
          });
          if (res.success) emailSentCount++;
          return res;
        });

      await Promise.all(emailPromises);
    }

    const firstItem = processedCandidates[0];
    const singleTakeUrl = firstItem?.invitation?.token
      ? `${baseUrl}/take/${firstItem.invitation.token}`
      : null;

    return NextResponse.json({
      message:
        processedCandidates.length === 1
          ? `Student ${firstItem.name} added to placement drive${
              shouldSendEmail ? " and invitation dispatched!" : "!"
            }`
          : `Successfully processed ${processedCandidates.length} candidate(s)${
              emailSentCount > 0 ? ` and sent ${emailSentCount} emails.` : "."
            }`,
      count: processedCandidates.length,
      candidate: firstItem,
      token: firstItem?.invitation?.token || null,
      takeUrl: singleTakeUrl,
      emailSent: emailSentCount > 0,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Error creating drive candidates:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
