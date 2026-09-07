import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/mailer";
import { enqueueJob, isSqsEnabled } from "@/lib/sqs";
import { getAppBaseUrl } from "@/lib/utils";

const inviteRequestSchema = z.object({
  candidateId: z.string().optional(), // single candidate
  candidateIds: z.array(z.string()).optional(), // batch candidates
  target: z.enum(["ALL", "SELECTED", "UNINVITED"]).optional(),
  customNote: z.string().optional(),
  expiresInHours: z.number().positive().optional(),
  expiresInDays: z.number().positive().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: driveId } = await params;
    const user = await requireAdminSession();
    const body = inviteRequestSchema.parse(await req.json().catch(() => ({})));

    const drive = await db.placementDrive.findUnique({
      where: { id: driveId, organizationId: user.organizationId },
      include: {
        organization: { select: { name: true } },
        test: {
          include: {
            sections: { select: { timeLimitSec: true } },
          },
        },
        candidates: {
          include: { invitation: true },
        },
      },
    });

    if (!drive) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (!drive.test) {
      return NextResponse.json(
        { error: "Assign a test to this placement drive before sending invitations" },
        { status: 400 },
      );
    }
    if (!drive.test.published) {
      return NextResponse.json(
        { error: "The assigned test must be published before inviting candidates" },
        { status: 400 },
      );
    }

    // Determine target candidates
    let targetCandidates = drive.candidates;

    if (body.candidateId) {
      targetCandidates = targetCandidates.filter((c) => c.id === body.candidateId);
    } else if (body.candidateIds && body.candidateIds.length > 0) {
      const idSet = new Set(body.candidateIds);
      targetCandidates = targetCandidates.filter((c) => idSet.has(c.id));
    } else if (body.target === "UNINVITED") {
      targetCandidates = targetCandidates.filter(
        (c) => !c.invitation || c.invitation.status === "SENT",
      );
    }

    if (targetCandidates.length === 0) {
      return NextResponse.json(
        { error: "No matching candidates found to invite in this drive" },
        { status: 400 },
      );
    }

    // Compute expiration
    const expiryMs = body.expiresInHours
      ? body.expiresInHours * 60 * 60 * 1000
      : body.expiresInDays
        ? body.expiresInDays * 24 * 60 * 60 * 1000
        : 14 * 24 * 60 * 60 * 1000; // default 14 days
    const expiresAt = new Date(Date.now() + expiryMs);

    // Auto-create or refresh invitation for candidates that lack one or need updated expiry
    const preparedCandidates = await db.$transaction(async (tx) => {
      const list = [];
      for (const cand of targetCandidates) {
        let invitation = cand.invitation;
        if (!invitation) {
          invitation = await tx.invitation.create({
            data: {
              testId: drive.testId!,
              email: cand.email,
              candidateName: cand.name,
              token: randomUUID(),
              expiresAt,
            },
          });
          await tx.driveCandidate.update({
            where: { id: cand.id },
            data: { invitationId: invitation.id },
          });
        } else if (body.expiresInHours || body.expiresInDays) {
          invitation = await tx.invitation.update({
            where: { id: invitation.id },
            data: { expiresAt },
          });
        }
        list.push({ ...cand, invitation });
      }
      return list;
    });

    const totalTimeLimitSec = drive.test.sections.reduce(
      (acc, s) => acc + s.timeLimitSec,
      0,
    );
    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    if (isSqsEnabled()) {
      const bulkPayload = preparedCandidates.map((c) => ({
        to: c.email,
        testName: drive.test!.name,
        link: `${baseUrl}/take/${c.invitation!.token}`,
        expiresAt: c.invitation!.expiresAt.toISOString(),
        customNote: body.customNote,
        organizationName: drive.organization.name,
        timeLimitSec: totalTimeLimitSec,
        candidateName: c.name,
      }));
      await enqueueJob({ type: "BULK_INVITE", invitations: bulkPayload });

      return NextResponse.json({
        message: `Queued ${preparedCandidates.length} placement invitation email(s) via background queue`,
        count: preparedCandidates.length,
        candidates: preparedCandidates.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          token: c.invitation!.token,
          takeUrl: `${baseUrl}/take/${c.invitation!.token}`,
          status: c.invitation!.status,
        })),
      });
    }

    // Direct mail dispatch
    const results = await Promise.all(
      preparedCandidates.map(async (c) => {
        const mailRes = await sendInvitationEmail({
          to: c.email,
          testName: drive.test!.name,
          link: `${baseUrl}/take/${c.invitation!.token}`,
          expiresAt: c.invitation!.expiresAt,
          customNote: body.customNote,
          organizationName: drive.organization.name,
          timeLimitSec: totalTimeLimitSec,
          candidateName: c.name,
          companyName: drive.companyName,
          jobRole: drive.jobRole,
          ctcPackage: drive.ctcPackage,
          labSlot: c.labSlot,
          rollNumber: c.rollNumber,
        });
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          token: c.invitation!.token,
          takeUrl: `${baseUrl}/take/${c.invitation!.token}`,
          status: c.invitation!.status,
          success: mailRes.success,
          error: mailRes.error,
        };
      }),
    );

    const sentCount = results.filter((r) => r.success).length;
    const failCount = results.length - sentCount;

    return NextResponse.json({
      message:
        preparedCandidates.length === 1
          ? `Invitation dispatched to ${preparedCandidates[0].name} (${preparedCandidates[0].email})`
          : `Dispatched ${sentCount} invitation emails (${failCount} failed)`,
      sentCount,
      failCount,
      candidates: results,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error("Error sending drive invitations:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
