import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeScore } from "@/lib/scoring";
import { serializeScoreForCandidate } from "@/lib/candidate-serializer";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const attempt = await db.attempt.findUnique({
    where: { id },
    select: {
      id: true,
      submittedAt: true,
      invitationId: true,
      invitation: {
        select: {
          test: {
            select: { sections: { select: { id: true, name: true, order: true } } },
          },
        },
      },
    },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!attempt.submittedAt) {
    await db.$transaction([
      db.attempt.update({
        where: { id },
        data: { submittedAt: new Date() },
      }),
      db.invitation.update({
        where: { id: attempt.invitationId },
        data: { status: "SUBMITTED" },
      }),
    ]);
  }

  // Re-runnable/idempotent — safe to call again after a key fix (spec section 6).
  const score = await computeScore(id);
  const candidateScore = serializeScoreForCandidate(
    score,
    attempt.invitation.test.sections,
  );

  return NextResponse.json({ ok: true, score: candidateScore });
}
