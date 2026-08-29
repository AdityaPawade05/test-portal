import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";
import { getAppBaseUrl } from "@/lib/utils";

export async function GET(
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
            published: true,
          },
        },
        attempt: { select: { id: true, startedAt: true, submittedAt: true } },
      },
    });

    if (!invitation || invitation.test.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const baseUrl = getAppBaseUrl(req.nextUrl.origin);

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        candidateName: invitation.candidateName,
        testId: invitation.testId,
        testName: invitation.test.name,
        token: invitation.token,
        inviteUrl: `${baseUrl}/invite/${invitation.token}`,
        takeUrl: `${baseUrl}/take/${invitation.token}`,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const invitation = await db.invitation.findUnique({
      where: { id },
      include: {
        test: { select: { organizationId: true } },
        attempt: { select: { id: true } },
      },
    });

    if (!invitation || invitation.test.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invitation.attempt) {
      return NextResponse.json(
        { error: "Cannot delete an invitation that has already been started or completed by the candidate." },
        { status: 400 }
      );
    }

    await db.invitation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Invitation deleted successfully" });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
