import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const shortlistSchema = z.object({
  candidateIds: z.array(z.string()).min(1),
  decision: z.enum(["PENDING", "SHORTLISTED", "WAITLISTED", "REJECTED"]),
  recruiterNotes: z.string().optional(),
  passcode: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: driveId } = await params;
    const session = await auth();
    const body = shortlistSchema.parse(await req.json());

    const drive = await db.placementDrive.findUnique({ where: { id: driveId } });
    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }

    const isAdmin =
      session?.user?.kind === "admin" &&
      session.user.organizationId === drive.organizationId;
    const isAuthorizedRecruiter =
      Boolean(body.passcode) && drive.accessPasscode === body.passcode;

    if (!isAdmin && !isAuthorizedRecruiter) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updated = await db.driveCandidate.updateMany({
      where: {
        driveId,
        id: { in: body.candidateIds },
      },
      data: {
        shortlistDecision: body.decision,
        ...(body.recruiterNotes !== undefined && {
          recruiterNotes: body.recruiterNotes,
        }),
      },
    });

    return NextResponse.json({
      message: `Updated shortlist decision to ${body.decision} for ${updated.count} candidate(s)`,
      count: updated.count,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Error updating shortlist:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
