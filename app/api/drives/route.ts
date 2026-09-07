import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";

const createDriveSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(100),
  companyLogoUrl: z.string().url().or(z.literal("")).nullish(),
  jobRole: z.string().min(1, "Job role is required").max(100),
  ctcPackage: z.string().max(50).nullish(),
  driveDate: z.string().transform((val) => new Date(val)),
  status: z.enum(["DRAFT", "SCHEDULED", "LIVE", "COMPLETED"]).default("SCHEDULED"),
  eligibilityMinCgpa: z.number().min(0).max(10).nullish(),
  eligibleBranches: z.array(z.string()).default([]),
  accessPasscode: z.string().max(50).nullish(),
  testId: z.string().nullish(),
});

export async function GET() {
  try {
    const user = await requireAdminSession();
    const drives = await db.placementDrive.findMany({
      where: { organizationId: user.organizationId },
      include: {
        test: {
          select: {
            id: true,
            name: true,
            cutoffPercent: true,
            _count: { select: { sections: true } },
          },
        },
        candidates: {
          select: {
            id: true,
            shortlistDecision: true,
            invitation: {
              select: {
                status: true,
                attempt: {
                  select: {
                    score: { select: { rawTotal: true, passed: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { driveDate: "desc" },
    });

    const transformedDrives = drives.map((drive) => {
      const totalCandidates = drive.candidates.length;
      const startedCount = drive.candidates.filter(
        (c) => c.invitation?.status === "STARTED" || c.invitation?.status === "SUBMITTED",
      ).length;
      const submittedCount = drive.candidates.filter(
        (c) => c.invitation?.status === "SUBMITTED",
      ).length;
      const shortlistedCount = drive.candidates.filter(
        (c) => c.shortlistDecision === "SHORTLISTED",
      ).length;

      return {
        ...drive,
        stats: {
          totalCandidates,
          startedCount,
          submittedCount,
          shortlistedCount,
        },
      };
    });

    return NextResponse.json({ drives: transformedDrives });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminSession();
    const body = createDriveSchema.parse(await req.json());

    // Generate access passcode for company recruiter if not provided
    const accessPasscode =
      body.accessPasscode?.trim() ||
      `${body.companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const drive = await db.placementDrive.create({
      data: {
        organizationId: user.organizationId,
        companyName: body.companyName,
        companyLogoUrl: body.companyLogoUrl || null,
        jobRole: body.jobRole,
        ctcPackage: body.ctcPackage || null,
        driveDate: body.driveDate,
        status: body.status,
        eligibilityMinCgpa: body.eligibilityMinCgpa ?? null,
        eligibleBranches: body.eligibleBranches,
        accessPasscode,
        testId: body.testId || null,
      },
      include: {
        test: true,
      },
    });

    return NextResponse.json({ drive }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    throw err;
  }
}
