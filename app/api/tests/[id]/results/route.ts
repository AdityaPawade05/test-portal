import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, ApiAuthError } from "@/lib/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdminSession();
    const { id } = await params;

    const test = await db.test.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        sections: { orderBy: { order: "asc" } },
        invitations: {
          orderBy: { createdAt: "desc" },
          include: {
            attempt: {
              include: {
                score: true,
                events: { select: { type: true } },
              },
            },
          },
        },
      },
    });
    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ test });
  } catch (err) {
    if (err instanceof ApiAuthError) return err.response;
    throw err;
  }
}
