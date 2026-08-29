import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/mailer";
import { enqueueJob, isSqsEnabled } from "@/lib/sqs";
import { getAppBaseUrl } from "@/lib/utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const invitation = await db.invitation.findUnique({
      where: { id },
      include: {
        test: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            sections: { select: { timeLimitSec: true } },
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (!invitation || invitation.test.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const totalTimeLimitSec = invitation.test.sections.reduce((acc, s) => acc + s.timeLimitSec, 0);
    const baseUrl = getAppBaseUrl(req.nextUrl.origin);
    const link = `${baseUrl}/invite/${invitation.token}`;
    const orgName = invitation.test.organization?.name || "Assessment Portal";

    // When SQS is available, enqueue asynchronously and return 202 immediately
    if (isSqsEnabled()) {
      await enqueueJob({
        type: "SEND_INVITE_EMAIL",
        to: invitation.email,
        testName: invitation.test.name,
        link,
        expiresAt: invitation.expiresAt.toISOString(),
        organizationName: orgName,
        timeLimitSec: totalTimeLimitSec,
        candidateName: invitation.candidateName ?? undefined,
      });
      return NextResponse.json({ ok: true, email: invitation.email, queued: true }, { status: 202 });
    }

    // Synchronous fallback when SQS is not configured
    const emailResult = await sendInvitationEmail({
      to: invitation.email,
      testName: invitation.test.name,
      link,
      expiresAt: invitation.expiresAt,
      organizationName: orgName,
      timeLimitSec: totalTimeLimitSec,
      candidateName: invitation.candidateName,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, email: invitation.email });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
