import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const updateDriveSchema = z.object({
  companyName: z.string().min(1).max(100).optional(),
  companyLogoUrl: z.string().url().or(z.literal("")).nullish(),
  jobRole: z.string().min(1).max(100).optional(),
  ctcPackage: z.string().max(50).nullish(),
  driveDate: z.string().transform((val) => new Date(val)).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "LIVE", "COMPLETED"]).optional(),
  eligibilityMinCgpa: z.number().min(0).max(10).nullish(),
  eligibleBranches: z.array(z.string()).optional(),
  accessPasscode: z.string().max(50).optional(),
  testId: z.string().nullish(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth();
    const url = new URL(req.url);
    const passkey = url.searchParams.get("passkey");

    const drive = await db.placementDrive.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        test: {
          include: {
            sections: { orderBy: { order: "asc" } },
          },
        },
        candidates: {
          include: {
            invitation: {
              include: {
                attempt: {
                  include: {
                    score: true,
                    events: { select: { id: true, type: true, occurredAt: true } },
                    _count: { select: { responses: true } },
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

    // Permission check: Either admin of same org OR valid recruiter passkey
    const isAdmin =
      session?.user?.kind === "admin" &&
      session.user.organizationId === drive.organizationId;
    const isAuthorizedRecruiter =
      Boolean(passkey) && drive.accessPasscode === passkey;

    if (!isAdmin && !isAuthorizedRecruiter) {
      return NextResponse.json(
        { error: "Unauthorized access to this placement drive" },
        { status: 401 },
      );
    }

    return NextResponse.json({ drive, isRecruiterView: !isAdmin });
  } catch (err) {
    console.error("Error fetching drive:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user || session.user.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drive = await db.placementDrive.findUnique({ where: { id } });
    if (!drive || drive.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    const body = updateDriveSchema.parse(await req.json());
    const updatedDrive = await db.placementDrive.update({
      where: { id },
      data: {
        ...(body.companyName && { companyName: body.companyName }),
        ...(body.companyLogoUrl !== undefined && { companyLogoUrl: body.companyLogoUrl }),
        ...(body.jobRole && { jobRole: body.jobRole }),
        ...(body.ctcPackage !== undefined && { ctcPackage: body.ctcPackage }),
        ...(body.driveDate && { driveDate: body.driveDate }),
        ...(body.status && { status: body.status }),
        ...(body.eligibilityMinCgpa !== undefined && { eligibilityMinCgpa: body.eligibilityMinCgpa }),
        ...(body.eligibleBranches && { eligibleBranches: body.eligibleBranches }),
        ...(body.accessPasscode && { accessPasscode: body.accessPasscode }),
        ...(body.testId !== undefined && { testId: body.testId }),
      },
      include: { test: true },
    });

    return NextResponse.json({ drive: updatedDrive });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Error updating drive:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user || session.user.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drive = await db.placementDrive.findUnique({ where: { id } });
    if (!drive || drive.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    await db.placementDrive.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting drive:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
