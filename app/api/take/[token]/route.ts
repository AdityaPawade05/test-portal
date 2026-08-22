import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeScoreForCandidate } from "@/lib/candidate-serializer";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: {
      test: {
        select: {
          id: true,
          name: true,
          published: true,
          sections: { select: { id: true, name: true, order: true } },
        },
      },
      attempt: { include: { score: true } },
    },
  });

  if (!invitation || !invitation.test.published) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    if (invitation.status !== "EXPIRED") {
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  let attempt = invitation.attempt;
  if (!attempt) {
    const created = await db.attempt.create({
      data: { invitationId: invitation.id, startedAt: new Date() },
    });
    attempt = { ...created, score: null };
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "STARTED" },
    });
  }

  if (attempt.submittedAt) {
    return NextResponse.json({
      attemptId: attempt.id,
      testName: invitation.test.name,
      submitted: true,
      score: attempt.score
        ? serializeScoreForCandidate(attempt.score, invitation.test.sections)
        : null,
    });
  }

  return NextResponse.json({
    attemptId: attempt.id,
    testName: invitation.test.name,
    submitted: false,
    sectionCount: invitation.test.sections.length,
  });
}
