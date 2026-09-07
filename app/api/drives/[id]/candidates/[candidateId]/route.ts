import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { getAppBaseUrl } from "@/lib/utils";

const updateCandidateSchema = z.object({
  name: z.string().min(1).optional(),
  rollNumber: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  cgpa: z.number().min(0).max(10).nullish(),
  passingYear: z.number().int().nullish(),
  labSlot: z.string().nullish(),
  recruiterNotes: z.string().nullish(),
  shortlistDecision: z.enum(["PENDING", "SHORTLISTED", "WAITLISTED", "REJECTED"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const { id: driveId, candidateId } = await params;
    const user = await requireAdminSession();
    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    const candidate = await db.driveCandidate.findFirst({
      where: {
        id: candidateId,
        driveId,
        drive: { organizationId: user.organizationId },
      },
      include: {
        drive: {
          select: {
            id: true,
            companyName: true,
            jobRole: true,
            test: { select: { id: true, name: true, published: true } },
          },
        },
        invitation: {
          include: {
            attempt: {
              include: {
                score: true,
                events: { select: { id: true, type: true, occurredAt: true } },
              },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const takeUrl = candidate.invitation?.token
      ? `${baseUrl}/take/${candidate.invitation.token}`
      : null;

    return NextResponse.json({
      candidate: {
        ...candidate,
        takeUrl,
        testStatus: candidate.invitation?.status || "NOT_INVITED",
        token: candidate.invitation?.token || null,
        expiresAt: candidate.invitation?.expiresAt || null,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("Error fetching single drive candidate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const { id: driveId, candidateId } = await params;
    const user = await requireAdminSession();
    const body = updateCandidateSchema.parse(await req.json());

    const candidate = await db.driveCandidate.findFirst({
      where: {
        id: candidateId,
        driveId,
        drive: { organizationId: user.organizationId },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const updated = await db.driveCandidate.update({
      where: { id: candidateId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.rollNumber && { rollNumber: body.rollNumber }),
        ...(body.branch && { branch: body.branch }),
        ...(body.cgpa !== undefined && { cgpa: body.cgpa }),
        ...(body.passingYear !== undefined && { passingYear: body.passingYear }),
        ...(body.labSlot !== undefined && { labSlot: body.labSlot }),
        ...(body.recruiterNotes !== undefined && { recruiterNotes: body.recruiterNotes }),
        ...(body.shortlistDecision && { shortlistDecision: body.shortlistDecision }),
      },
    });

    return NextResponse.json({ candidate: updated, message: "Candidate updated" });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Error updating drive candidate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const { id: driveId, candidateId } = await params;
    const user = await requireAdminSession();

    const candidate = await db.driveCandidate.findFirst({
      where: {
        id: candidateId,
        driveId,
        drive: { organizationId: user.organizationId },
      },
      include: {
        invitation: {
          include: { attempt: true },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Delete candidate
    await db.$transaction(async (tx) => {
      const invId = candidate.invitationId;
      const hasAttempt = Boolean(candidate.invitation?.attempt);

      // Remove driveCandidate reference
      await tx.driveCandidate.delete({ where: { id: candidateId } });

      // If invitation exists and has no attempt, safely delete invitation too
      if (invId && !hasAttempt) {
        await tx.invitation.delete({ where: { id: invId } }).catch(() => null);
      }
    });

    return NextResponse.json({
      message: `Candidate ${candidate.name} (${candidate.email}) removed from placement drive.`,
      success: true,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    console.error("Error deleting candidate:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
